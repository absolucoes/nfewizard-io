import payloadIbscbs from '../../../examples/payload-ibscbs.exemplo.json';
import type { ImpCTe } from '@nfewizard/types/cte';
import { validarXmlCte } from './CTeSchema.js';

describe('validarXmlCte', () => {
    it('carrega e aplica o XSD oficial do CT-e 4.00, recusando XML incompleto', async () => {
        await expect(validarXmlCte('<CTe xmlns="http://www.portalfiscal.inf.br/cte"/>')).rejects.toThrow(
            'CTE_SCHEMA_INVALIDO:',
        );
    });

    it('falha com erro nomeado se o schema pedido não existir', async () => {
        await expect(validarXmlCte('<x/>', 'ausente.xsd')).rejects.toThrow('CTE_SCHEMA_NAO_ENCONTRADO');
    });
});

const chaveEvento = '52261012ABC34501DE35570010000000011123456787';
const assinaturaEvento = '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><ds:Reference URI="#ID110111' + chaveEvento + '001"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>AA==</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>AA==</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>AA==</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature>';
const eventoCancelamento = '<eventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><infEvento Id="ID110111' + chaveEvento + '001"><cOrgao>52</cOrgao><tpAmb>2</tpAmb><CNPJ>11222333000181</CNPJ><chCTe>' + chaveEvento + '</chCTe><dhEvento>2026-10-09T18:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>001</nSeqEvento><detEvento versaoEvento="4.00"><evCancCTe><descEvento>Cancelamento</descEvento><nProt>152260000000001</nProt><xJust>Justificativa fictícia com tamanho válido.</xJust></evCancCTe></detEvento></infEvento>' + assinaturaEvento + '</eventoCTe>';

describe('validação dos eventos CT-e', () => {
    it('aceita evento de cancelamento assinado com payload fictício no XSD oficial', async () => {
        await expect(validarXmlCte(eventoCancelamento, 'eventoCTe_v4.00.xsd')).resolves.toBeUndefined();
    });

    it('valida o schema de detalhe do cancelamento e recusa protocolo ausente', async () => {
        const detalhe = '<evCancCTe xmlns="http://www.portalfiscal.inf.br/cte"><descEvento>Cancelamento</descEvento><nProt>152260000000001</nProt><xJust>Justificativa fictícia com tamanho válido.</xJust></evCancCTe>';
        await expect(validarXmlCte(detalhe, 'evCancCTe_v4.00.xsd')).resolves.toBeUndefined();
        await expect(validarXmlCte(detalhe.replace('<nProt>152260000000001</nProt>', ''), 'evCancCTe_v4.00.xsd')).rejects.toThrow('CTE_SCHEMA_INVALIDO');
    });
});

describe('fixture estrutural IBS/CBS', () => {
    const payloadTipado: { imp: ImpCTe } = payloadIbscbs;
    it('mantém o grupo de teste como um payload de CT-e tipado, sem regra em produção', () => {
        expect(payloadTipado.imp.IBSCBS).toMatchObject({ CST: '000', cClassTrib: '000001', gIBSCBS: { vBC: '100.00', gIBSUF: { pIBSUF: '0.1000', vIBSUF: '0.10' }, gIBSMun: { pIBSMun: '0.0000', vIBSMun: '0.00' }, gCBS: { pCBS: '0.9000', vCBS: '0.90' } } });
    });
});
