/*
 * Conciliação financeira (ECONF, 110750) e seu cancelamento (110751) da NFC-e: o XML sai na ordem do leiaute, com
 * o descEvento fixado pela lib, vai ao autorizador da UF (cOrgao da UF, não 92) e passa pelo XSD da NT 2024.002.
 * Certificado: par de chaves gerado na hora, nenhum certificado real. Dados fictícios.
 */
import path from 'path';
import { XmlBuilder, NFE_SchemaValidate } from '@nfewizard/shared';
import { publicKey, privateKey, utilityFalso, conferirOuro, CHAVE } from '../../NFCEAutorizacao/test-support/apoio';

const { NFCERecepcaoEventoService } = require('../NFCERecepcaoEventoService');

const OURO = path.join(__dirname, 'ouro');

function montarServico() {
    const environment: any = {
        getConfig: () => ({
            dfe: { ambiente: 2, UF: 'GO', baixarXMLDistribuicao: false },
            nfe: { ambiente: 2, versaoDF: '4.00' },
            lib: {},
        }),
        getCert: () => publicKey,
        getCertKey: () => privateKey,
    };
    return new NFCERecepcaoEventoService(environment, utilityFalso, new XmlBuilder(environment), {}, {}, {});
}

const PIX = { indPag: 0, tPag: '17', vPag: '50.00', dPag: '2026-10-13' };
const BOLETO = { indPag: 1, tPag: '15', vPag: '30.00', dPag: '2026-10-20' };
const CARTAO = {
    indPag: 0, tPag: '03', vPag: '20.00', dPag: '2026-10-13',
    CNPJPag: '11222333000181', UFPag: 'GO', CNPJIF: '33444555000166', tBand: '01', cAut: 'A1B2C3',
};

function econf(detPag: unknown[] = [PIX, BOLETO, CARTAO], extra: Record<string, unknown> = {}) {
    return {
        cOrgao: 52,
        tpAmb: 2,
        CNPJ: '11222333000181',
        chNFe: CHAVE,
        dhEvento: '2026-10-13T10:30:00-03:00',
        tpEvento: '110750',
        nSeqEvento: 1,
        verEvento: '1.00',
        detEvento: { verAplic: 'Vanir 1.0', detPag },
        ...extra,
    };
}

function cancelamento(extra: Record<string, unknown> = {}) {
    return {
        cOrgao: 52,
        tpAmb: 2,
        CNPJ: '11222333000181',
        chNFe: CHAVE,
        dhEvento: '2026-10-13T11:00:00-03:00',
        tpEvento: '110751',
        nSeqEvento: 1,
        verEvento: '1.00',
        detEvento: { verAplic: 'Vanir 1.0', nProtEvento: '152260000000002' },
        ...extra,
    };
}

function gerar(e: any) {
    return (montarServico() as any).gerarXmlRecepcaoEvento([e], 1, false) as string;
}

/** O par de chaves do teste não é certificado: o KeyInfo sai vazio e o XSD exige um X509Certificate. */
function paraXsd(xml: string) {
    return xml.replace(/<KeyInfo\/>|<KeyInfo>[\s\S]*?<\/KeyInfo>/, '<KeyInfo><X509Data><X509Certificate>AAAA</X509Certificate></X509Data></KeyInfo>');
}

describe('ECONF (110750) da NFC-e', () => {
    it('gera o envEvento na ordem do leiaute (ouro)', () => {
        conferirOuro('evento-110750.xml', gerar(econf()), OURO);
    });

    it('passa no XSD do ECONF com três detPag (Pix, boleto e cartão)', async () => {
        const xml = gerar(econf());
        expect(xml.match(/<detPag>/g)).toHaveLength(3);
        const r = await NFE_SchemaValidate(paraXsd(xml), 'NFEEventoEConf');
        expect(r.errors).toEqual([]);
        expect(r.success).toBe(true);
    });

    it('impõe descEvento "ECONF" mesmo que o chamador mande outra coisa', () => {
        const xml = gerar(econf(undefined, { detEvento: { descEvento: 'Outro', verAplic: 'Vanir 1.0', detPag: [PIX] } }));
        expect(xml).toContain('<descEvento>ECONF</descEvento>');
        expect(xml).not.toContain('Outro');
    });

    it('o Id é o tpEvento, a chave e o sequencial com 2 dígitos', () => {
        expect(gerar(econf())).toContain(`Id="ID110750${CHAVE}01"`);
    });

    it('a NFC-e mantém o cOrgao da UF (só a NF-e vai à SVRS, 92)', () => {
        const xml = gerar(econf());
        expect(xml).toContain('<cOrgao>52</cOrgao>');
        expect(xml).not.toContain('<cOrgao>92</cOrgao>');
    });

    it('o XSD recusa o que a lib não corrige: tPag malformado, dPag fora do formato e CNPJPag sem UFPag', async () => {
        // controle: sem a mexida, o mesmo XML passa
        await expect(NFE_SchemaValidate(paraXsd(gerar(econf())), 'NFEEventoEConf')).resolves.toMatchObject({ success: true });

        const tPag = gerar(econf([{ ...PIX, tPag: '1' }]));
        await expect(NFE_SchemaValidate(paraXsd(tPag), 'NFEEventoEConf')).rejects.toMatchObject({ success: false });

        const dPag = gerar(econf([{ ...PIX, dPag: '13/10/2026' }]));
        await expect(NFE_SchemaValidate(paraXsd(dPag), 'NFEEventoEConf')).rejects.toMatchObject({ success: false });

        const semUf = gerar(econf([{ ...PIX, CNPJPag: '11222333000181' }]));
        await expect(NFE_SchemaValidate(paraXsd(semUf), 'NFEEventoEConf')).rejects.toMatchObject({ success: false });
    });

    it('o XSD aceita 100 detPag e recusa 101', async () => {
        const cem = Array.from({ length: 100 }, () => PIX);
        await expect(NFE_SchemaValidate(paraXsd(gerar(econf(cem))), 'NFEEventoEConf')).resolves.toMatchObject({ success: true });
        const cento1 = Array.from({ length: 101 }, () => PIX);
        await expect(NFE_SchemaValidate(paraXsd(gerar(econf(cento1))), 'NFEEventoEConf')).rejects.toMatchObject({ success: false });
    });

    it('o retorno do 110750 e do 110751 ganha o nome do evento', () => {
        const s = montarServico() as any;
        expect(s.getTipoEventoName('110750')).toBe('ECONF');
        expect(s.getTipoEventoName('110751')).toBe('Cancelamento ECONF');
    });
});

describe('cancelamento do ECONF (110751) da NFC-e', () => {
    it('gera o envEvento na ordem do leiaute (ouro)', () => {
        conferirOuro('evento-110751.xml', gerar(cancelamento()), OURO);
    });

    it('passa no XSD do cancelamento do ECONF', async () => {
        const r = await NFE_SchemaValidate(paraXsd(gerar(cancelamento())), 'NFEEventoCancEConf');
        expect(r.errors).toEqual([]);
        expect(r.success).toBe(true);
    });

    it('impõe o descEvento acentuado que o XSD enumera', () => {
        expect(gerar(cancelamento())).toContain('<descEvento>Cancelamento Conciliação Financeira</descEvento>');
    });

    it('o XSD recusa protocolo que não tem 15 dígitos', async () => {
        const curto = gerar(cancelamento({ detEvento: { verAplic: 'Vanir 1.0', nProtEvento: '123' } }));
        await expect(NFE_SchemaValidate(paraXsd(curto), 'NFEEventoCancEConf')).rejects.toMatchObject({ success: false });
    });
});

describe('lote de ECONF da NFC-e', () => {
    it('o lote não mistura ECONF com cancelamento nem com outro evento', async () => {
        const s = montarServico() as any;
        await expect(s.validarLoteEconf([econf(), cancelamento()], '<x/>')).rejects.toThrow(/mistura/);
        await expect(s.validarLoteEconf([econf(), { ...econf(), tpEvento: '110111' }], '<x/>')).rejects.toThrow(/mistura/);
    });

    it('recusa lote vazio e com mais de 20 eventos, antes da rede', async () => {
        const s = montarServico() as any;
        await expect(s.Exec({ idLote: 1, modelo: '65', evento: [] })).rejects.toThrow(/ao menos um evento/);
        const vinte1 = Array.from({ length: 21 }, (_, i) => econf(undefined, { nSeqEvento: (i % 99) + 1 }));
        await expect(s.Exec({ idLote: 1, modelo: '65', evento: vinte1 })).rejects.toThrow(/máximo é 20/);
    });

    it('valida o XML do lote contra o XSD do ECONF antes de enviar', async () => {
        const s = montarServico() as any;
        // sem o X509Certificate o XML não passa no XSD: a recusa vem da validação, não da rede
        await expect(s.validarLoteEconf([econf()], gerar(econf()))).rejects.toThrow(/não passa no XSD/);
        await expect(s.validarLoteEconf([econf()], paraXsd(gerar(econf())))).resolves.toBeUndefined();
    });
});
