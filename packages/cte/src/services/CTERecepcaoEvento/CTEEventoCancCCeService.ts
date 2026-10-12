import { AxiosInstance } from 'axios';
import { getCodIBGE, Environment, Utility, XmlBuilder, XmlParser, logger } from '@nfewizard/shared';
import { GerarConsultaImpl, SaveFilesImpl } from '@nfewizard/types/shared';
import { CTE_VERSAO } from '../util/CTEBaseService.js';
import { validarXmlCte } from '../util/CTeSchema.js';
import { agoraComOffsetBrasilia } from '../util/DhEventoBrasilia.js';
import { CTeCancelamento, CTeCartaCorrecao, CTeEventoCancCCeResultado } from '@nfewizard/types/cte';

const METHOD_NAME = 'CTeRecepcaoEvento';
const XMLNS = 'http://www.portalfiscal.inf.br/cte';
const JUSTIFICATIVA_CCE = 'A Carta de Correcao e disciplinada pelo Art. 58-B do CONVENIO/SINIEF 06/89: Fica permitida a utilizacao de carta de correcao, para regularizacao de erro ocorrido na emissao de documentos fiscais relativos a prestacao de servico de transporte, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da prestacao;II - a correcao de dados cadastrais que implique mudanca do emitente, tomador, remetente ou do destinatario;III - a data de emissao ou de saida.';

type Evento = CTeCancelamento | CTeCartaCorrecao;

export class CTEEventoCancCCeService {
    constructor(
        private readonly environment: Environment,
        private readonly utility: Utility,
        private readonly xmlBuilder: XmlBuilder,
        private readonly axios: AxiosInstance,
        _saveFiles: SaveFilesImpl,
        private readonly gerarConsulta: GerarConsultaImpl,
    ) {}

    private validarChave(chave: string): void {
        if (!/^[0-9]{6}[0-9A-Z]{12}[0-9]{26}$/.test(chave)) {
            throw new Error('CTE_EVENTO_CHAVE_INVALIDA: chave deve conter 44 caracteres válidos');
        }
    }

    private async gerarEvento(evento: Evento, tpEvento: '110110' | '110111'): Promise<string> {
        this.validarChave(evento.chCTe);
        const sequencia = evento.nSeqEvento ?? 1;
        if (!Number.isInteger(sequencia) || sequencia < 1 || sequencia > 999) {
            throw new Error('CTE_EVENTO_SEQUENCIA_INVALIDA: nSeqEvento deve estar entre 1 e 999');
        }
        const { dfe: { UF }, nfe: { ambiente } } = this.environment.getConfig();
        const tpAmb = evento.tpAmb ?? ambiente;
        if (String(tpAmb) !== String(ambiente)) {
            throw new Error('CTE_EVENTO_AMBIENTE_DIVERGENTE: tpAmb deve corresponder ao ambiente configurado');
        }
        const cOrgao = evento.cOrgao ?? getCodIBGE(UF);
        const dhEvento = evento.dhEvento ?? agoraComOffsetBrasilia();
        let detalhe: Record<string, unknown>;

        if (tpEvento === '110111') {
            const cancelamento = evento as CTeCancelamento;
            if (cancelamento.xJust.trim().length < 15 || cancelamento.xJust.trim().length > 255) {
                throw new Error('CTE_CANCELAMENTO_JUSTIFICATIVA_INVALIDA: xJust deve ter de 15 a 255 caracteres');
            }
            detalhe = { descEvento: 'Cancelamento', nProt: cancelamento.nProt, xJust: cancelamento.xJust.trim() };
        } else {
            const carta = evento as CTeCartaCorrecao;
            if (!Array.isArray(carta.infCorrecao) || carta.infCorrecao.length < 1) {
                throw new Error('CTE_CCE_CORRECOES_AUSENTES: informe ao menos uma infCorrecao');
            }
            detalhe = {
                descEvento: 'Carta de Correção',
                infCorrecao: carta.infCorrecao.map((item) => ({
                    grupoAlterado: item.grupoAlterado,
                    campoAlterado: item.campoAlterado,
                    valorAlterado: item.valorAlterado,
                    ...(item.nroItemAlterado === undefined ? {} : { nroItemAlterado: String(item.nroItemAlterado) }),
                })),
                xCondUso: JUSTIFICATIVA_CCE,
            };
        }

        const tagDetalhe = tpEvento === '110111' ? 'evCancCTe' : 'evCCeCTe';
        const xmlDetalhe = this.xmlBuilder.gerarXml({ $: { xmlns: XMLNS }, ...detalhe }, tagDetalhe, METHOD_NAME);
        await validarXmlCte(xmlDetalhe, tagDetalhe + '_v4.00.xsd');

        const xmlObject = {
            $: { versao: CTE_VERSAO, xmlns: XMLNS },
            infEvento: {
                $: { Id: 'ID' + tpEvento + evento.chCTe + String(sequencia).padStart(3, '0') },
                cOrgao,
                tpAmb,
                CNPJ: evento.CNPJ,
                chCTe: evento.chCTe,
                dhEvento,
                tpEvento,
                nSeqEvento: String(sequencia).padStart(3, '0'),
                detEvento: { $: { versaoEvento: CTE_VERSAO }, [tagDetalhe]: detalhe },
            },
        };
        const xmlAssinado = this.xmlBuilder.assinarXML(this.xmlBuilder.gerarXml(xmlObject, 'eventoCTe', METHOD_NAME), 'infEvento');
        await validarXmlCte(xmlAssinado, 'eventoCTe_v4.00.xsd');
        return xmlAssinado;
    }

    private async enviar(evento: Evento, tpEvento: '110110' | '110111'): Promise<CTeEventoCancCCeResultado> {
        const xml = await this.gerarEvento(evento, tpEvento);
        const xmlSoap = await this.gerarConsulta.gerarConsulta(xml, METHOD_NAME, false, CTE_VERSAO, 'CTe', false, '', 'cteDadosMsg');
        const resposta = await this.axios.post(xmlSoap.webServiceUrl, xmlSoap.xmlFormated, {
            headers: { 'Content-Type': 'application/soap+xml; action="' + xmlSoap.action + '"' },
            httpsAgent: xmlSoap.agent,
        });
        this.utility.salvaConsulta(xml, xmlSoap.xmlFormated, METHOD_NAME);
        this.utility.salvaRetorno(resposta.data, resposta.data, METHOD_NAME);
        const retorno = new XmlParser().convertXmlToJson(resposta.data, METHOD_NAME) as any;
        const itens = Array.isArray(retorno?.retEventoCTe) ? retorno.retEventoCTe : [retorno?.retEventoCTe ?? retorno];
        const eventos = itens.map((item: any) => {
            const info = item?.infEvento ?? item;
            if (info?.cStat === undefined || info?.cStat === null) {
                throw new Error('CTE_EVENTO_RETORNO_SEM_CSTAT: retorno não contém cStat');
            }
            return {
                chCTe: info.chCTe,
                tpEvento,
                cStat: String(info.cStat),
                xMotivo: info.xMotivo,
                nProt: info.nProt,
                dhRegEvento: info.dhRegEvento,
            };
        });
        if (!eventos.length) throw new Error('CTE_EVENTO_RETORNO_VAZIO: serviço não retornou eventos');
        const aceitos = eventos.every((item: any) => ['134', '135', '136'].includes(item.cStat));
        logger.info('Retorno da recepção de evento CT-e processado', { context: 'CTEEventoCancCCeService', tpEvento });
        return { success: aceitos, eventos };
    }

    async cancelar(evento: CTeCancelamento): Promise<CTeEventoCancCCeResultado> {
        return this.enviar(evento, '110111');
    }

    async cartaCorrecao(evento: CTeCartaCorrecao): Promise<CTeEventoCancCCeResultado> {
        return this.enviar(evento, '110110');
    }
}

