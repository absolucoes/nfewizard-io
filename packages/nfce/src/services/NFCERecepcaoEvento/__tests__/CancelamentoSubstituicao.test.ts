/*
 * Evento 110112 (cancelamento por substituição) da NFC-e: o XML sai na ordem do leiaute, com o
 * descEvento sem acento e tpAutor 1, e passa pelo XSD e110112/envEventoCancSubst. Certificado: par de
 * chaves gerado na hora, nenhum certificado real.
 */
import path from 'path';
import { XmlBuilder, NFE_SchemaValidate } from '@nfewizard/shared';
import { publicKey, privateKey, utilityFalso, conferirOuro, CHAVE } from '../../NFCEAutorizacao/test-support/apoio';

const { NFCERecepcaoEventoService } = require('../NFCERecepcaoEventoService');

const OURO = path.join(__dirname, 'ouro');
const CHAVE_SUBSTITUTA = '52261011222333000181658800000000021123456781';

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

function evento(detEvento: Record<string, unknown> = {}) {
    return {
        cOrgao: 52,
        tpAmb: 2,
        CNPJ: '11222333000181',
        chNFe: CHAVE,
        dhEvento: '2026-10-13T10:30:00-03:00',
        tpEvento: '110112',
        nSeqEvento: 1,
        verEvento: '1.00',
        detEvento: {
            nProt: '152260000000001',
            xJust: 'NFC-e emitida em contingencia substituida',
            chNFeRef: CHAVE_SUBSTITUTA,
            verAplic: 'Vanir 1.0',
            ...detEvento,
        },
    };
}

function gerar(e: any = evento()) {
    return (montarServico() as any).gerarXmlRecepcaoEvento([e], 1, false) as string;
}

/**
 * O par de chaves do teste não é um certificado, então o KeyInfo sai sem X509Certificate, que o XSD
 * exige. Para validar o resto do leiaute, entra um X509Certificate de mentira (base64 qualquer).
 */
function paraXsd(xml: string) {
    return xml.replace(/<KeyInfo\/>|<KeyInfo>[\s\S]*?<\/KeyInfo>/, '<KeyInfo><X509Data><X509Certificate>AAAA</X509Certificate></X509Data></KeyInfo>');
}

describe('evento 110112 da NFC-e', () => {
    it('gera o envEvento na ordem do leiaute (ouro)', () => {
        conferirOuro('evento-110112.xml', gerar(), OURO);
    });

    it('passa no XSD do cancelamento por substituição', async () => {
        const r = await NFE_SchemaValidate(paraXsd(gerar()), 'NFEEventoCancSubst');
        expect(r.errors).toEqual([]);
        expect(r.success).toBe(true);
    });

    it('o XSD recusa o que a lib não manda: descEvento acentuado e campos fora de ordem', async () => {
        // controle: sem a mexida, o mesmo XML passa; as duas mexidas abaixo é que o derrubam
        await expect(NFE_SchemaValidate(paraXsd(gerar()), 'NFEEventoCancSubst')).resolves.toMatchObject({ success: true });

        const acentuado = gerar().replace('Cancelamento por substituicao', 'Cancelamento por substituição');
        await expect(NFE_SchemaValidate(paraXsd(acentuado), 'NFEEventoCancSubst')).rejects.toMatchObject({ success: false });

        const fora = gerar().replace(/(<nProt>[^<]*<\/nProt>)(<xJust>[^<]*<\/xJust>)/, '$2$1');
        await expect(NFE_SchemaValidate(paraXsd(fora), 'NFEEventoCancSubst')).rejects.toMatchObject({ success: false });
    });

    it('impõe descEvento e tpAutor 1 mesmo que o chamador mande outra coisa', () => {
        const xml = gerar(evento({ descEvento: 'Cancelamento', tpAutor: 2 }));
        expect(xml).toContain('<descEvento>Cancelamento por substituicao</descEvento>');
        expect(xml).toContain('<tpAutor>1</tpAutor>');
        expect(xml).not.toContain('<tpAutor>2</tpAutor>');
    });

    it('usa cOrgao como cOrgaoAutor quando não vem e respeita o que vem', () => {
        expect(gerar()).toContain('<cOrgaoAutor>52</cOrgaoAutor>');
        expect(gerar(evento({ cOrgaoAutor: 35 }))).toContain('<cOrgaoAutor>35</cOrgaoAutor>');
    });

    it('o Id é o tpEvento, a chave e o sequencial com 2 dígitos', () => {
        expect(gerar()).toContain(`Id="ID110112${CHAVE}01"`);
    });

    it.each([
        ['nProt', { nProt: '' }, /nProt/],
        ['xJust curta', { xJust: 'curta' }, /xJust/],
        ['chNFeRef inválida', { chNFeRef: '123' }, /chNFeRef/],
        ['verAplic', { verAplic: '' }, /verAplic/],
    ])('recusa evento sem %s', (_nome, parte, erro) => {
        expect(() => gerar(evento(parte as Record<string, unknown>))).toThrow(erro);
    });

    it('o cancelamento comum (110111) segue sem mexer no detEvento', () => {
        const comum = {
            ...evento(),
            tpEvento: '110111',
            detEvento: { descEvento: 'Cancelamento', nProt: '152260000000001', xJust: 'Cancelamento de teste da nota' },
        };
        const xml = gerar(comum);
        expect(xml).toContain('<descEvento>Cancelamento</descEvento>');
        expect(xml).not.toContain('chNFeRef');
    });

    it('o retorno do 110112 ganha o nome do evento', () => {
        expect((montarServico() as any).getTipoEventoName('110112')).toBe('Cancelamento por Substituição');
    });
});
