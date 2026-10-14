// @ts-nocheck
/*
 * Inutilização de numeração do modelo 65 (NFC-e) pelo NFE_Inutilizacao: a lib já atendia, mas sem prova.
 * O ouro fixa o XML (sem a assinatura) e o XSD inutNFe_v4.00 o valida. Certificado: par de chaves
 * gerado na hora, nenhum certificado real.
 */
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { XmlBuilder, NFE_SchemaValidate } from '@nfewizard/shared';

const NFEInutilizacaoService = require('../NFEInutilizacaoService').default;

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function montarServico() {
    const environment = {
        getConfig: () => ({
            dfe: { ambiente: 2, UF: 'GO', baixarXMLDistribuicao: false },
            nfe: { ambiente: 2, versaoDF: '4.00' },
            lib: {},
        }),
        getCert: () => publicKey,
        getCertKey: () => privateKey,
    };
    return new NFEInutilizacaoService(environment, {}, new XmlBuilder(environment), {}, {}, {});
}

const pedido = (mod: string) => ({
    cUF: 52,
    ano: '26',
    CNPJ: '11222333000181',
    mod,
    serie: '880',
    nNFIni: '1',
    nNFFin: '5',
    xJust: 'Numeracao pulada por falha no PDV',
});

const semAssinatura = (xml: string) =>
    xml
        .replace(/<SignatureValue>[^<]*<\/SignatureValue>/, '<SignatureValue/>')
        .replace(/<KeyInfo>[\s\S]*?<\/KeyInfo>/, '<KeyInfo/>');

// O par de chaves do teste não é um certificado: o KeyInfo precisa de um X509Certificate para o XSD.
const paraXsd = (xml: string) =>
    xml.replace(/<KeyInfo>[\s\S]*?<\/KeyInfo>/, '<KeyInfo><X509Data><X509Certificate>AAAA</X509Certificate></X509Data></KeyInfo>');

describe('inutilização do modelo 65', () => {
    it('gera o XML do pedido da NFC-e (ouro)', () => {
        const xml = montarServico().gerarXmlNFeInutilizacao(pedido('65'));
        const ouro = path.join(__dirname, 'ouro', 'inutilizacao-mod65.xml');
        if (process.env.UPDATE_OURO === '1') {
            fs.mkdirSync(path.dirname(ouro), { recursive: true });
            fs.writeFileSync(ouro, semAssinatura(xml));
        }
        expect(semAssinatura(xml)).toBe(fs.readFileSync(ouro, 'utf8'));
    });

    it('o Id leva o modelo 65, a série e os números com zeros à esquerda', () => {
        const xml = montarServico().gerarXmlNFeInutilizacao(pedido('65'));
        expect(xml).toContain('Id="ID52261122233300018165880000000001000000005"');
    });

    it('passa no XSD inutNFe_v4.00', async () => {
        const xml = paraXsd(montarServico().gerarXmlNFeInutilizacao(pedido('65')));
        const r = await NFE_SchemaValidate(xml, 'NFEInutilizacao');
        expect(r.errors).toEqual([]);
        expect(r.success).toBe(true);
    });

    it('o webservice é o da NFC-e: o serviço escolhe o modelo pelo pedido', () => {
        const servico = montarServico();
        expect(servico.getModelo(pedido('65'))).toBe('NFCe');
        expect(servico.getModelo(pedido('55'))).toBe('NFe');
    });

    it('recusa modelo fora de 55 e 65', () => {
        expect(() => montarServico().gerarXmlNFeInutilizacao(pedido('57'))).toThrow(/55 ou 65/);
    });
});
