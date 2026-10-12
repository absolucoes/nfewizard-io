import { Builder } from 'xml2js';
import { calcularDigitoVerificadorMdfe } from './calcular-dv-mdfe.js';
import { validarXmlMdfe } from './MDFeSchema.js';

const NS = 'http://www.portalfiscal.inf.br/mdfe';
const DS = 'http://www.w3.org/2000/09/xmldsig#';

function criarMdfeFicticio(): string {
  const cnpj = '12345678000195';
  const semDv = '35' + '2610' + cnpj + '58' + '001' + '000000001' + '1' + '12345678';
  const dv = calcularDigitoVerificadorMdfe(semDv);
  const chave = semDv + dv;
  const assinatura = {
    'ds:SignedInfo': {
      'ds:CanonicalizationMethod': { $: { Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' } },
      'ds:SignatureMethod': { $: { Algorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1' } },
      'ds:Reference': {
        $: { URI: '#MDFe' + chave },
        'ds:Transforms': {
          'ds:Transform': [
            { $: { Algorithm: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature' } },
            { $: { Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' } }
          ]
        },
        'ds:DigestMethod': { $: { Algorithm: 'http://www.w3.org/2000/09/xmldsig#sha1' } },
        'ds:DigestValue': 'AA=='
      }
    },
    'ds:SignatureValue': 'AA==',
    'ds:KeyInfo': { 'ds:X509Data': { 'ds:X509Certificate': 'AA==' } }
  };
  const mdfe = {
    $: { xmlns: NS },
    infMDFe: {
      $: { Id: 'MDFe' + chave, versao: '3.00' },
      ide: {
        cUF: '35', tpAmb: '2', tpEmit: '2', mod: '58', serie: '1', nMDF: '1',
        cMDF: '12345678', cDV: String(dv), modal: '1', dhEmi: '2026-10-09T12:00:00-03:00',
        tpEmis: '1', procEmi: '0', verProc: 'Vanir teste', UFIni: 'GO', UFFim: 'SP',
        infMunCarrega: { cMunCarrega: '5208707', xMunCarrega: 'Goiania' }
      },
      emit: {
        CNPJ: cnpj, IE: '123456789', xNome: 'Transportadora Ficticia',
        enderEmit: { xLgr: 'Rua de Teste', nro: '1', xBairro: 'Centro', cMun: '5208707', xMun: 'Goiania', CEP: '74000000', UF: 'GO' }
      },
      infModal: { $: { versaoModal: '3.00' }, rodo: {} },
      infDoc: {
        infMunDescarga: {
          cMunDescarga: '3550308',
          xMunDescarga: 'Sao Paulo',
          infNFe: { chNFe: '35261012345678000195550010000000011000000001' }
        }
      },
      tot: { qNFe: '1', vCarga: '100.00', cUnid: '01', qCarga: '1.0000' }
    },
    infMDFeSupl: { qrCodMDFe: { _: 'https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=' + chave + '&tpAmb=2', $: {} } },
    'ds:Signature': { $: { 'xmlns:ds': DS }, ...assinatura }
  };
  return new Builder({ headless: true, renderOpts: { pretty: false } }).buildObject({ MDFe: mdfe });
}

describe('validarXmlMdfe', () => {
  it('aceita MDF-e rodoviário fictício tpEmit 2 com os campos exigidos no XSD', async () => {
    await expect(validarXmlMdfe(criarMdfeFicticio())).resolves.toBeUndefined();
  });

  it('rejeita estrutura sem os campos obrigatórios do MDF-e 3.00b', async () => {
    await expect(validarXmlMdfe('<MDFe xmlns="' + NS + '"/>')).rejects.toThrow('MDFE_SCHEMA_INVALIDO');
  });

  it('rejeita MDF-e fictício sem o número do manifesto', async () => {
    const xmlSemNumero = criarMdfeFicticio().replace(/<nMDF>1<\/nMDF>/, '');
    await expect(validarXmlMdfe(xmlSemNumero)).rejects.toThrow('MDFE_SCHEMA_INVALIDO');
  });
});
