import { gzipSync } from 'node:zlib';
import { Builder, parseStringPromise } from 'xml2js';

export interface ResultadoAutorizacaoMdfe {
  success: boolean;
  cStat?: string;
  xMotivo?: string;
  nProt?: string;
  xmlProcessado?: string;
  resposta?: unknown;
}

function buscar(obj: any, chave: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, chave)) return obj[chave];
  for (const valor of Object.values(obj)) {
    const encontrado = buscar(valor, chave);
    if (encontrado !== undefined) return encontrado;
  }
  return undefined;
}

function escXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function compactarXmlMdfe(xml: string): string {
  return gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
}

export function montarEnvelopeSoapMdfe(dadosMsg: string, operacao: string): string {
  const namespace = 'http://www.portalfiscal.inf.br/mdfe/wsdl/' + operacao;
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    '<soap12:Body><' + operacao + ' xmlns="' + namespace + '"><mdfeDadosMsg>' + escXml(dadosMsg) +
    '</mdfeDadosMsg></' + operacao + '></soap12:Body></soap12:Envelope>';
}

export async function analisarRespostaXmlMdfe(xmlRetorno: string): Promise<{ resposta?: unknown; cStat?: string; xMotivo?: string }> {
  try {
    const resposta: any = await parseStringPromise(xmlRetorno, { explicitArray: false, explicitRoot: true, attrkey: '$', charkey: '_' });
    const evento = buscar(resposta, 'retEventoMDFe');
    const retorno = evento?.infEvento ?? buscar(resposta, 'retEnviMDFe') ?? buscar(resposta, 'retMDFe') ?? buscar(resposta, 'retConsStatServMDFe');
    const cStat = retorno?.cStat === undefined ? undefined : String(retorno.cStat);
    return {
      resposta,
      cStat,
      xMotivo: retorno?.xMotivo === undefined ? (cStat ? undefined : 'Resposta do MDF-e sem cStat.') : String(retorno.xMotivo)
    };
  } catch (erro) {
    return { xMotivo: 'Resposta SOAP inválida: ' + (erro instanceof Error ? erro.message : String(erro)) };
  }
}

export async function interpretarRetornoAutorizacaoMdfe(xmlRetorno: string, xmlMdfe: string): Promise<ResultadoAutorizacaoMdfe> {
  let resposta: any;
  try {
    resposta = await parseStringPromise(xmlRetorno, { explicitArray: false, explicitRoot: true, attrkey: '$', charkey: '_' });
  } catch (erro) {
    return { success: false, xMotivo: 'Resposta SOAP inválida: ' + (erro instanceof Error ? erro.message : String(erro)) };
  }

  const retorno = buscar(resposta, 'retEnviMDFe') ?? buscar(resposta, 'retMDFe');
  const cStat = retorno?.cStat === undefined ? undefined : String(retorno.cStat);
  const xMotivo = retorno?.xMotivo === undefined ? undefined : String(retorno.xMotivo);
  const protocolo = retorno?.protMDFe;
  const nProt = protocolo?.infProt?.nProt === undefined ? undefined : String(protocolo.infProt.nProt);
  const base: ResultadoAutorizacaoMdfe = {
    success: cStat === '100',
    cStat,
    xMotivo: xMotivo ?? (cStat ? 'Resposta sem xMotivo.' : 'Resposta sem cStat de autorização.'),
    nProt,
    resposta
  };

  if (cStat !== '100' || !protocolo) return base;
  const builder = new Builder({ headless: true, renderOpts: { pretty: false } });
  const protocoloXml = builder.buildObject({ protMDFe: protocolo });
  base.xmlProcessado = '<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">' + xmlMdfe + protocoloXml + '</mdfeProc>';
  return base;
}
