import { gzipSync } from 'node:zlib';
import { Builder, parseStringPromise, processors } from 'xml2js';

export interface ResultadoAutorizacaoMdfe {
  success: boolean;
  cStat?: string;
  xMotivo?: string;
  nProt?: string;
  xmlProcessado?: string;
  resposta?: unknown;
}

/** Operações do MDF-e na SVRS, com o método do WSDL (o `action` do SOAP 1.2 é `<namespace>/<método>`). */
export const OPERACOES_MDFE = {
  MDFeRecepcaoSinc: 'mdfeRecepcao',
  MDFeRecepcaoEvento: 'mdfeRecepcaoEvento',
  MDFeConsulta: 'mdfeConsultaMDF',
  MDFeStatusServico: 'mdfeStatusServicoMDF',
  MDFeConsNaoEnc: 'mdfeConsNaoEnc'
} as const;

export type OperacaoMdfe = keyof typeof OPERACOES_MDFE;

const VERSAO_DADOS_MDFE = '3.00';

function buscar(obj: any, chave: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, chave)) return obj[chave];
  for (const valor of Object.values(obj)) {
    const encontrado = buscar(valor, chave);
    if (encontrado !== undefined) return encontrado;
  }
  return undefined;
}

export function compactarXmlMdfe(xml: string): string {
  return gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
}

/** Namespace do WSDL de cada operação: o mesmo no `mdfeCabecMsg` e no `mdfeDadosMsg`. */
export function namespaceSoapMdfe(operacao: OperacaoMdfe): string {
  return 'http://www.portalfiscal.inf.br/mdfe/wsdl/' + operacao;
}

/** `action` do SOAP 1.2: namespace do serviço mais o método da operação. */
export function actionSoapMdfe(operacao: OperacaoMdfe): string {
  return namespaceSoapMdfe(operacao) + '/' + OPERACOES_MDFE[operacao];
}

/**
 * Envelope SOAP 1.2 como o WSDL da SVRS pede: `mdfeCabecMsg` (cUF e versaoDados) no Header e `mdfeDadosMsg`
 * direto no Body, sem elemento com o nome da operação em volta. Na autorização síncrona o conteúdo é o XML
 * compactado em Base64 (texto); nas demais operações é o XML da mensagem, como nó, sem escapar.
 */
export function montarEnvelopeSoapMdfe(dadosMsg: string, operacao: OperacaoMdfe, cUF: string | number): string {
  const namespace = namespaceSoapMdfe(operacao);
  const conteudo = dadosMsg.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    '<soap12:Header><mdfeCabecMsg xmlns="' + namespace + '"><cUF>' + String(cUF) + '</cUF><versaoDados>' + VERSAO_DADOS_MDFE + '</versaoDados></mdfeCabecMsg></soap12:Header>' +
    '<soap12:Body><mdfeDadosMsg xmlns="' + namespace + '">' + conteudo + '</mdfeDadosMsg></soap12:Body></soap12:Envelope>';
}

const OPCOES_PARSE = { explicitArray: false, explicitRoot: true, attrkey: '$', charkey: '_', tagNameProcessors: [processors.stripPrefix] };

export interface RespostaMdfe {
  resposta?: unknown;
  cStat?: string;
  xMotivo?: string;
  /** Só na lista de não encerrados (`retConsMDFeNaoEnc`): chave e protocolo de cada MDF-e. */
  naoEncerrados?: Array<{ chMDFe: string; nProt?: string }>;
  chaves?: string[];
}

function texto(valor: any): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(typeof valor === 'object' && '_' in valor ? valor._ : valor);
}

export async function analisarRespostaXmlMdfe(xmlRetorno: string): Promise<RespostaMdfe> {
  try {
    const resposta: any = await parseStringPromise(xmlRetorno, OPCOES_PARSE);
    // A consulta de situação carrega os eventos do MDF-e (retEventoMDFe) dentro de si: o retorno que vale
    // é o da própria consulta, então os retornos "de cima" são procurados antes do de evento.
    const consulta = buscar(resposta, 'retConsSitMDFe');
    const naoEnc = buscar(resposta, 'retConsMDFeNaoEnc');
    const evento = buscar(resposta, 'retEventoMDFe');
    const retorno = consulta ?? naoEnc ?? buscar(resposta, 'retEnviMDFe') ?? buscar(resposta, 'retMDFe')
      ?? buscar(resposta, 'retConsStatServMDFe') ?? evento?.infEvento;
    const cStat = texto(retorno?.cStat);
    const resultado: RespostaMdfe = {
      resposta,
      cStat,
      xMotivo: retorno?.xMotivo === undefined ? (cStat ? undefined : 'Resposta do MDF-e sem cStat.') : texto(retorno.xMotivo)
    };
    if (naoEnc && !consulta) {
      const itens = naoEnc.infMDFe === undefined ? [] : [].concat(naoEnc.infMDFe);
      resultado.naoEncerrados = itens.map((item: any) => ({ chMDFe: String(texto(item.chMDFe)), nProt: texto(item.nProt) }));
      resultado.chaves = resultado.naoEncerrados.map((item) => item.chMDFe);
    }
    return resultado;
  } catch (erro) {
    return { xMotivo: 'Resposta SOAP inválida: ' + (erro instanceof Error ? erro.message : String(erro)) };
  }
}

export async function interpretarRetornoAutorizacaoMdfe(xmlRetorno: string, xmlMdfe: string): Promise<ResultadoAutorizacaoMdfe> {
  let resposta: any;
  try {
    resposta = await parseStringPromise(xmlRetorno, OPCOES_PARSE);
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
