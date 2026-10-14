/*
 * Fork Vanir: QR Code da NFC-e versão 3 (NT 2025.001), escolhida por `nfe.versaoQRCode` (padrão 2).
 *
 * - v3 online: `<urlQRCode>?p=<chave>|3|<tpAmb>`, sem idCSC nem CSC.
 * - v3 off-line (tpEmis 4 e 9): `...|3|<tpAmb>|<dia>|<vNF>|<tp_idDest>|<idDest>|<assinatura>`, a assinatura
 *   sendo RSA-SHA1 em base64 do texto anterior com a chave privada do certificado do emitente.
 * - v2 (padrão) não pode mudar um byte: os XMLs de ouro em ./ouro foram gerados pelo código anterior a esta
 *   correção (menos SignatureValue e KeyInfo, que dependem do certificado). Para regerar um ouro de propósito:
 *   UPDATE_OURO=1 npx jest QRCode.
 *
 * Os vetores abaixo seguem o formato descrito na NT; o texto da NT não está no repositório, então a prova do
 * off-line é a assinatura conferida com a chave pública do par gerado no teste.
 */
import { createPublicKey, createVerify } from 'crypto';
import {
    generateQRCodeURLOfflineV3,
    generateQRCodeURLOnlineV3,
    montarTextoQRCodeOfflineV3,
} from '../util/NFCEQRCode';
import {
    CHAVE,
    CSC_FICTICIO,
    URL_QR,
    conferirOuro,
    montarNFe,
    montarServico,
    privateKey,
    publicKey,
    qrCodeDoXml,
    semAssinatura,
    utilityFalso,
} from '../test-support/apoio';

function assinaturaConfere(texto: string, assinaturaBase64: string): boolean {
    return createVerify('RSA-SHA1').update(texto).verify(createPublicKey(publicKey), assinaturaBase64, 'base64');
}

describe('QR Code v3 - funções', () => {
    it('online: chave|3|tpAmb, sem idCSC e sem CSC', () => {
        expect(generateQRCodeURLOnlineV3(`NFe${CHAVE}`, 2, utilityFalso)).toBe(`${URL_QR}?p=${CHAVE}|3|2`);
        expect(generateQRCodeURLOnlineV3(CHAVE, 1, utilityFalso)).toBe(`${URL_QR}?p=${CHAVE}|3|1`);
    });

    it('texto do off-line com CNPJ', () => {
        expect(montarTextoQRCodeOfflineV3(`NFe${CHAVE}`, 2, '13', '10.00', 1, '11222333000181'))
            .toBe(`${CHAVE}|3|2|13|10.00|1|11222333000181`);
    });

    it('texto do off-line com CPF', () => {
        expect(montarTextoQRCodeOfflineV3(CHAVE, 2, '13', '10.00', 2, '11144477735'))
            .toBe(`${CHAVE}|3|2|13|10.00|2|11144477735`);
    });

    it('texto do off-line com idEstrangeiro', () => {
        expect(montarTextoQRCodeOfflineV3(CHAVE, 2, '13', '10.00', 3, 'AB1234567'))
            .toBe(`${CHAVE}|3|2|13|10.00|3|AB1234567`);
    });

    it('texto do off-line sem destinatário mantém os pipes dos campos vazios', () => {
        expect(montarTextoQRCodeOfflineV3(CHAVE, 2, '13', '10.00', '', ''))
            .toBe(`${CHAVE}|3|2|13|10.00||`);
    });

    it('off-line: assinatura RSA-SHA1 em base64 conferida com a chave pública', () => {
        const url = generateQRCodeURLOfflineV3(`NFe${CHAVE}`, 2, '13', '10.00', 2, '11144477735', privateKey, utilityFalso);
        const prefixo = `${URL_QR}?p=${CHAVE}|3|2|13|10.00|2|11144477735|`;
        expect(url.startsWith(prefixo)).toBe(true);

        const assinatura = url.slice(prefixo.length);
        expect(assinatura).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        expect(Buffer.from(assinatura, 'base64')).toHaveLength(256);
        expect(assinaturaConfere(`${CHAVE}|3|2|13|10.00|2|11144477735`, assinatura)).toBe(true);
        // qualquer byte trocado no texto invalida a assinatura
        expect(assinaturaConfere(`${CHAVE}|3|2|13|10.01|2|11144477735`, assinatura)).toBe(false);
    });

    it('off-line sem destinatário assina o texto com os dois campos vazios', () => {
        const url = generateQRCodeURLOfflineV3(CHAVE, 2, '13', '10.00', '', '', privateKey, utilityFalso);
        const prefixo = `${URL_QR}?p=${CHAVE}|3|2|13|10.00|||`;
        expect(url.startsWith(prefixo)).toBe(true);
        expect(assinaturaConfere(`${CHAVE}|3|2|13|10.00||`, url.slice(prefixo.length))).toBe(true);
    });
});

describe('QR Code no XML da autorização', () => {
    const v2 = { idCSC: 1, tokenCSC: CSC_FICTICIO };

    it('v2 online (padrão): XML idêntico ao ouro gerado antes da correção', () => {
        const servico = montarServico(v2);
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe());
        conferirOuro('nfce-v2-online.xml', xml);
    });

    it('v2 off-line (tpEmis 9): XML idêntico ao ouro gerado antes da correção', () => {
        const servico = montarServico(v2);
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe({ tpEmis: 9 }));
        conferirOuro('nfce-v2-offline.xml', xml);
    });

    it('versaoQRCode 2 explícito é o mesmo que omitir', () => {
        const omitido = montarServico(v2)['gerarXmlNFCEAutorizacao'](montarNFe());
        const explicito = montarServico({ ...v2, versaoQRCode: 2 })['gerarXmlNFCEAutorizacao'](montarNFe());
        expect(semAssinatura(explicito)).toBe(semAssinatura(omitido));
    });

    it('v3 online: qrCode sem CSC, sem idCSC e sem hash, e a config não exige idCSC nem tokenCSC', () => {
        // CHAVE é a chave que o serviço calcula para esta NFC-e (a mesma do ouro do v2 online)
        const servico = montarServico({ versaoQRCode: 3 });
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe());
        expect(qrCodeDoXml(xml)).toBe(`${URL_QR}?p=${CHAVE}|3|2`);
        expect(xml).not.toContain(CSC_FICTICIO);
    });

    it('v3 off-line (tpEmis 9) com CPF: dia do dhEmi, vNF, tp_idDest 2 e assinatura que confere', () => {
        const servico = montarServico({ versaoQRCode: 3 });
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe({ tpEmis: 9 }));
        const qr = qrCodeDoXml(xml);
        // a chave muda com tpEmis 9 (posição 35); vem da chave calculada pelo serviço
        const chaveDoXml = xml.match(/Id="NFe(\d{44})"/)![1];
        const esperado = `${URL_QR}?p=${chaveDoXml}|3|2|13|10.00|2|11144477735|`;
        expect(qr.startsWith(esperado)).toBe(true);
        expect(assinaturaConfere(`${chaveDoXml}|3|2|13|10.00|2|11144477735`, qr.slice(esperado.length))).toBe(true);
    });

    it('v3 off-line com CNPJ no destinatário usa tp_idDest 1', () => {
        const servico = montarServico({ versaoQRCode: 3 });
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe({ tpEmis: 9, dest: { CNPJ: '11222333000181', xNome: 'EMPRESA', indIEDest: 9 } }));
        expect(qrCodeDoXml(xml)).toMatch(/\|3\|2\|13\|10\.00\|1\|11222333000181\|/);
    });

    it('v3 off-line sem destinatário deixa tp_idDest e idDest vazios', () => {
        const servico = montarServico({ versaoQRCode: 3 });
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe({ tpEmis: 9, dest: null }));
        expect(qrCodeDoXml(xml)).toMatch(/\|3\|2\|13\|10\.00\|\|\|/);
    });

    it('v3 off-line (tpEmis 4, EPEC) também é assinado', () => {
        const servico = montarServico({ versaoQRCode: 3 });
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe({ tpEmis: 4 }));
        expect(qrCodeDoXml(xml)).toMatch(/\|3\|2\|13\|10\.00\|2\|11144477735\|[A-Za-z0-9+/]+={0,2}$/);
    });

    it('tpEmis em texto ("9", como vem de um XML lido) também é contingência', () => {
        const servico = montarServico({ versaoQRCode: 3 });
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe({ tpEmis: '9' }));
        expect(qrCodeDoXml(xml)).toMatch(/\|3\|2\|13\|10\.00\|2\|11144477735\|[A-Za-z0-9+/]+={0,2}$/);
    });

    it('o dia do QR sai do texto do dhEmi, não do fuso do processo (22:30 em Brasília já é dia 14 em UTC)', () => {
        const servico = montarServico({ versaoQRCode: 3 });
        const xml = servico['gerarXmlNFCEAutorizacao'](montarNFe({ tpEmis: 9, dhEmi: '2026-10-13T22:30:00-03:00' }));
        expect(qrCodeDoXml(xml)).toMatch(/\|3\|2\|13\|10\.00\|/);
        expect(servico['diaEmissao']('2026-10-13T22:30:00-03:00')).toBe('13');
        expect(servico['diaEmissao']('2026-01-01T00:10:00-03:00')).toBe('01');
    });

    it('versaoQRCode fora de 2 e 3 é recusada', () => {
        const servico = montarServico({ ...v2, versaoQRCode: 4 });
        expect(() => servico['gerarXmlNFCEAutorizacao'](montarNFe())).toThrow(/versaoQRCode=4/);
    });

    it('validarTpEmisParaTransmissaoContingencia aceita tpEmis em texto', () => {
        const servico = montarServico(v2);
        const nfe9 = montarNFe({ tpEmis: '9' });
        const nfe1 = montarNFe({ tpEmis: 1 });
        expect(() => servico['validarTpEmisParaTransmissaoContingencia'](nfe9)).not.toThrow();
        expect(() => servico['validarTpEmisParaTransmissaoContingencia'](nfe1)).toThrow(/tpEmis=1/);
    });
});
