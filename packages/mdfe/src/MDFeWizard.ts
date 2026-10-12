import { Environment, XmlBuilder } from '@nfewizard/shared';
import type { NFeWizardProps } from '@nfewizard/types/shared';
import { calcularDigitoVerificadorMdfe } from './util/calcular-dv-mdfe.js';
import { montarUrlQrCodeMdfe } from './util/MDFeQrCode.js';
import { validarXmlMdfe } from './util/MDFeSchema.js';
import { analisarRespostaXmlMdfe, compactarXmlMdfe, interpretarRetornoAutorizacaoMdfe, montarEnvelopeSoapMdfe } from './util/MDFeTransmissao.js';
import { DadosEventoMdfe, montarXmlEventoMdfe } from './util/MDFeEvento.js';
import servicos from './config/MDFeServicosUrl.json' with { type: 'json' };

export interface MDFePayload {
  infMDFe: {
    ide: Record<string, any>;
    emit: Record<string, any>;
    [key: string]: any;
  };
}

export function prepararIdentificacaoMdfe(payload: MDFePayload, codigoNumerico?: string): string {
  const ide = payload.infMDFe.ide;
  const emit = payload.infMDFe.emit;
  const cnpj = String(emit.CNPJ ?? '');
  if (!/^[0-9A-Z]{14}$/.test(cnpj)) throw new Error('MDFE_CNPJ_INVALIDO: o CNPJ do emitente deve ter 14 caracteres alfanuméricos maiúsculos');
  const dhEmi = String(ide.dhEmi ?? '');
  const match = dhEmi.match(/^(\d{4})-(\d{2})/);
  if (!match) throw new Error('MDFE_DATA_EMISSAO_INVALIDA: informe ide.dhEmi no formato ISO');
  const cUF = String(ide.cUF ?? '').padStart(2, '0');
  const serie = String(ide.serie ?? '').padStart(3, '0');
  const nMDF = String(ide.nMDF ?? '').padStart(9, '0');
  const tpEmis = String(ide.tpEmis ?? 1);
  const cMDF = String(ide.cMDF ?? codigoNumerico ?? Math.floor(Math.random() * 100000000).toString().padStart(8, '0')).padStart(8, '0');
  const semDv = cUF + match[1].slice(-2) + match[2] + cnpj + '58' + serie + nMDF + tpEmis + cMDF;
  const dv = calcularDigitoVerificadorMdfe(semDv);
  Object.assign(ide, { mod: 58, tpEmis: Number(tpEmis), cMDF, cDV: dv });
  return semDv + dv;
}

const SCHEMA_EVENTO: Record<DadosEventoMdfe['tpEvento'], { elemento: string; schema: string }> = {
  '110111': { elemento: 'evCancMDFe', schema: 'evCancMDFe_v3.00.xsd' },
  '110112': { elemento: 'evEncMDFe', schema: 'evEncMDFe_v3.00.xsd' },
  '110114': { elemento: 'evIncCondutorMDFe', schema: 'evIncCondutorMDFe_v3.00.xsd' }
};

export class MDFeWizard {
  protected environment?: Environment;
  protected xmlBuilder?: XmlBuilder;
  protected axios?: any;

  async MDFe_LoadEnvironment({ config }: { config: NFeWizardProps }): Promise<void> {
    this.environment = new Environment(config);
    const loaded = await this.environment.loadEnvironment();
    this.axios = loaded.axios;
    this.xmlBuilder = new XmlBuilder(this.environment);
  }

  async NFE_LoadEnvironment({ config }: { config: NFeWizardProps }): Promise<void> {
    return this.MDFe_LoadEnvironment({ config });
  }

  private exigirAmbiente(): asserts this is this & { environment: Environment; xmlBuilder: XmlBuilder; axios: any } {
    if (!this.environment || !this.xmlBuilder || !this.axios) throw new Error('MDFE_AMBIENTE_NAO_CARREGADO');
  }

  private obterUrl(tpAmb: number | string, operacao: keyof typeof servicos['1']): string {
    const url = (servicos as any)[String(tpAmb)]?.[operacao];
    if (!url) throw new Error('MDFE_AMBIENTE_INVALIDO: esperado 1 (produção) ou 2 (homologação)');
    return url;
  }

  private headersSoap(operacao: string) {
    const action = 'http://www.portalfiscal.inf.br/mdfe/wsdl/' + operacao;
    return { 'Content-Type': 'application/soap+xml; charset=utf-8; action="' + action + '"' };
  }

  private async enviar(tpAmb: number | string, operacao: keyof typeof servicos['1'], xml: string): Promise<any> {
    this.exigirAmbiente();
    const envelope = montarEnvelopeSoapMdfe(xml, operacao);
    const resposta = await this.axios.post(this.obterUrl(tpAmb, operacao), envelope, {
      headers: this.headersSoap(operacao)
    });
    return analisarRespostaXmlMdfe(String(resposta.data));
  }

  async MDFe_Autorizacao(payload: MDFePayload): Promise<any> {
    this.exigirAmbiente();
    const ide = payload.infMDFe.ide;
    const chave = prepararIdentificacaoMdfe(payload);
    const xmlObject = {
      $: { xmlns: 'http://www.portalfiscal.inf.br/mdfe' },
      infMDFe: { $: { Id: 'MDFe' + chave, versao: '3.00' }, ...payload.infMDFe }
    };
    const xmlSemSupl = this.xmlBuilder.gerarXml(xmlObject, 'MDFe', 'MDFeRecepcaoSinc');
    let xml = this.xmlBuilder.assinarXML(xmlSemSupl, 'infMDFe');
    const qrCode = montarUrlQrCodeMdfe(chave, ide.tpAmb, ide.tpEmis ?? 1, String(this.environment.getConfig().dfe.UF));
    xml = xml.replace('</infMDFe>', '</infMDFe><infMDFeSupl><qrCodMDFe><![CDATA[' + qrCode + ']]></qrCodMDFe></infMDFeSupl>');
    await validarXmlMdfe(xml);

    const envelope = montarEnvelopeSoapMdfe(compactarXmlMdfe(xml), 'MDFeRecepcaoSinc');
    const resposta = await this.axios.post(this.obterUrl(ide.tpAmb, 'MDFeRecepcaoSinc'), envelope, {
      headers: this.headersSoap('MDFeRecepcaoSinc')
    });
    const retorno = await interpretarRetornoAutorizacaoMdfe(String(resposta.data), xml);
    return { ...retorno, chave, xmlAssinado: xml };
  }

  async MDFe_ConsultaStatusServico(tpAmb: 1 | 2): Promise<any> {
    this.exigirAmbiente();
    const xml = this.xmlBuilder.gerarXml({
      $: { xmlns: 'http://www.portalfiscal.inf.br/mdfe', versao: '3.00' },
      tpAmb,
      xServ: 'STATUS'
    }, 'consStatServMDFe');
    await validarXmlMdfe(xml, 'consStatServMDFe_v3.00.xsd');
    return this.enviar(tpAmb, 'MDFeStatusServico', xml);
  }

  async MDFe_Consulta(chave: string, tpAmb: 1 | 2): Promise<any> {
    this.exigirAmbiente();
    const xml = this.xmlBuilder.gerarXml({
      $: { xmlns: 'http://www.portalfiscal.inf.br/mdfe', versao: '3.00' },
      tpAmb,
      xServ: 'CONSULTAR',
      chMDFe: chave
    }, 'consSitMDFe');
    await validarXmlMdfe(xml, 'consSitMDFe_v3.00.xsd');
    return this.enviar(tpAmb, 'MDFeConsulta', xml);
  }

  async MDFe_ConsNaoEncerrados(cnpj: string, tpAmb: 1 | 2): Promise<any> {
    this.exigirAmbiente();
    const xml = this.xmlBuilder.gerarXml({
      $: { xmlns: 'http://www.portalfiscal.inf.br/mdfe', versao: '3.00' },
      tpAmb,
      xServ: 'CONSULTAR NÃO ENCERRADOS',
      CNPJ: cnpj
    }, 'consMDFeNaoEnc');
    await validarXmlMdfe(xml, 'consMDFeNaoEnc_v3.00.xsd');
    return this.enviar(tpAmb, 'MDFeConsNaoEnc', xml);
  }

  async MDFe_RecepcaoEvento(dados: DadosEventoMdfe): Promise<any> {
    this.exigirAmbiente();
    const xml = montarXmlEventoMdfe(dados);
    const schema = SCHEMA_EVENTO[dados.tpEvento];
    const fragmento = xml.match(new RegExp('<' + schema.elemento + '>[\\s\\S]*?<\\/' + schema.elemento + '>'))?.[0];
    if (!fragmento) throw new Error('MDFE_EVENTO_DETALHE_AUSENTE');
    const detalhe = fragmento.replace('<' + schema.elemento + '>', '<' + schema.elemento + ' xmlns="http://www.portalfiscal.inf.br/mdfe">');
    await validarXmlMdfe(detalhe, schema.schema);
    const assinado = this.xmlBuilder.assinarXML(xml, 'infEvento');
    await validarXmlMdfe(assinado, 'eventoMDFe_v3.00.xsd');
    const retorno = await this.enviar(dados.tpAmb, 'MDFeRecepcaoEvento', assinado);
    return { ...retorno, success: retorno.cStat === '135' };
  }
}
