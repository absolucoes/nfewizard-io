import { montarXmlEventoMdfe } from './MDFeEvento.js';
import { validarXmlMdfe } from './MDFeSchema.js';

const base = {
  cOrgao: '35',
  tpAmb: 2 as const,
  cnpj: 'AB12CD34000195',
  chave: '352610AB12CD34000195580010000000011000000001',
  dhEvento: '2026-10-09T12:00:00-03:00'
};

function assinarEstruturalmenteParaValidacao(xml: string): string {
  const ds = 'http://www.w3.org/2000/09/xmldsig#';
  const assinatura = '<ds:Signature xmlns:ds="' + ds + '">' +
    '<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>' +
    '<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>' +
    '<ds:Reference URI="#evento"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>' +
    '<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></ds:Transforms>' +
    '<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><ds:DigestValue>AA==</ds:DigestValue>' +
    '</ds:Reference></ds:SignedInfo><ds:SignatureValue>AA==</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>AA==</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature>';
  return xml.replace('</eventoMDFe>', assinatura + '</eventoMDFe>');
}

async function validarEvento(xml: string, elemento: string, schemaDetalhe: string) {
  const fragmento = xml.match(new RegExp('<' + elemento + '>[\\s\\S]*?<\\/' + elemento + '>'))?.[0];
  expect(fragmento).toBeDefined();
  const detalhe = fragmento!.replace('<' + elemento + '>', '<' + elemento + ' xmlns="http://www.portalfiscal.inf.br/mdfe">');
  await expect(validarXmlMdfe(detalhe, schemaDetalhe)).resolves.toBeUndefined();
  await expect(validarXmlMdfe(assinarEstruturalmenteParaValidacao(xml), 'eventoMDFe_v3.00.xsd')).resolves.toBeUndefined();
}

describe('eventos MDF-e 3.00b', () => {
  it('gera XML do evento de cancelamento com justificativa', async () => {
    const xml = montarXmlEventoMdfe({ ...base, tpEvento: '110111', nProt: '135260000000001', xJust: 'Viagem cancelada por teste' });
    await validarEvento(xml, 'evCancMDFe', 'evCancMDFe_v3.00.xsd');
  });

  it('gera XML do evento de encerramento com local de descarregamento', async () => {
    const xml = montarXmlEventoMdfe({ ...base, tpEvento: '110112', nProt: '135260000000001', dtEnc: '2026-10-09', cUF: '35', cMun: '3550308' });
    await validarEvento(xml, 'evEncMDFe', 'evEncMDFe_v3.00.xsd');
  });

  it('gera XML do evento de inclusão de condutor', async () => {
    const xml = montarXmlEventoMdfe({ ...base, tpEvento: '110114', xNome: 'Motorista Teste', cpf: '12345678909' });
    await validarEvento(xml, 'evIncCondutorMDFe', 'evIncCondutorMDFe_v3.00.xsd');
  });
});
