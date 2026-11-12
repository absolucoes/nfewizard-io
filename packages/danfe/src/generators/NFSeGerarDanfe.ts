/*
 * This file is part of NFeWizard.
 *
 * NFeWizard is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * NFeWizard is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with NFeWizard. If not, see <https://www.gnu.org/licenses/>.
 */

import { logger, ValidaCPFCNPJ, XmlParser } from '@nfewizard/shared';
import { format, parseISO } from 'date-fns';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { gunzipSync } from 'zlib';

/** Valor escalar como devolvido pelo parser de XML (sempre string) ou informado via JSON. */
type Escalar = string | number | undefined | null;

export interface NFSeEnderecoNacional {
    xLgr?: string;
    nro?: string;
    xCpl?: string;
    xBairro?: string;
    cMun?: string;
    xMun?: string;
    UF?: string;
    CEP?: string;
}

export interface NFSeEndereco {
    endNac?: NFSeEnderecoNacional;
    endExt?: {
        cPais?: string;
        cEndPost?: string;
        xCidade?: string;
        xEstProvReg?: string;
    };
    xLgr?: string;
    nro?: string;
    xCpl?: string;
    xBairro?: string;
}

/** Prestador / tomador / intermediário / emitente. */
export interface NFSePessoa {
    CNPJ?: string;
    CPF?: string;
    NIF?: string;
    CAEPF?: string;
    IM?: string;
    xNome?: string;
    xFant?: string;
    /** Endereço no nó `emit` da NFSe. */
    enderNac?: NFSeEnderecoNacional;
    /** Endereço nos nós `prest`/`toma`/`interm` do DPS. */
    end?: NFSeEndereco;
    fone?: string;
    email?: string;
    regTrib?: {
        opSimpNac?: Escalar;
        regApTribSN?: Escalar;
        regEspTrib?: Escalar;
    };
}

export interface NFSeTribMun {
    tribISSQN?: Escalar;
    cPaisResult?: string;
    tpImunidade?: Escalar;
    exigSusp?: { tpSusp?: Escalar; nProcesso?: string };
    BM?: { tpBM?: Escalar; nBM?: string; vRedBCBM?: Escalar; pRedBCBM?: Escalar };
    tpRetISSQN?: Escalar;
    pAliq?: Escalar;
}

export interface NFSeTribFed {
    piscofins?: {
        CST?: Escalar;
        vBCPisCofins?: Escalar;
        pAliqPis?: Escalar;
        pAliqCofins?: Escalar;
        vPis?: Escalar;
        vCofins?: Escalar;
        tpRetPisCofins?: Escalar;
    };
    vRetCP?: Escalar;
    vRetIRRF?: Escalar;
    vRetCSLL?: Escalar;
}

export interface NFSeTotTrib {
    vTotTrib?: { vTotTribFed?: Escalar; vTotTribEst?: Escalar; vTotTribMun?: Escalar };
    pTotTrib?: { pTotTribFed?: Escalar; pTotTribEst?: Escalar; pTotTribMun?: Escalar };
    indTotTrib?: Escalar;
}

/** Documento de dedução/redução do leiaute 1.01 (`docDedRed`). */
export interface NFSeDocDedRed {
    chNFSe?: string;
    chNFe?: string;
    NFSeMun?: { cMunNFSeMun?: Escalar; nNFSeMun?: Escalar; cVerifNFSeMun?: string };
    NFNFS?: { nNFS?: Escalar; modNFS?: Escalar; serieNFS?: string };
    nDocFisc?: string;
    nDoc?: string;
    tpDedRed?: Escalar;
    xDescOutDed?: string;
    dtEmiDoc?: string;
    vDedutivelRedutivel?: Escalar;
    vDeducaoReducao?: Escalar;
    fornec?: { xNome?: string };
}

/** Documento de ajuste da base de cálculo da NT 009 (`docAjusteBC`). */
export interface NFSeDocAjusteBC {
    tpAjusteBC?: Escalar;
    xTpAjusteBC?: string;
    vTotDoc?: Escalar;
    vAjusteAplic?: Escalar;
    dtEmiDoc?: string;
    dtCompDoc?: string;
    dFeNacional?: { tipoChaveDFe?: Escalar; xTipoChaveDFe?: string; chaveDFe?: string };
    docFiscalOutro?: { cMunDocFiscal?: Escalar; nDocFiscal?: string; xDocFiscal?: string };
    docOutro?: { nDoc?: string; xDoc?: string };
    fornec?: { xNome?: string };
}

/** O parser de XML devolve objeto quando há um nó e vetor quando há vários. */
type UmOuVarios<T> = T | T[];

export interface NFSeValoresDPS {
    vServPrest?: { vReceb?: Escalar; vServ?: Escalar };
    vDescCondIncond?: { vDescIncond?: Escalar; vDescCond?: Escalar };
    /** Leiaute 1.01: dedução/redução por valor, percentual ou documentos. */
    vDedRed?: { pDR?: Escalar; vDR?: Escalar; documentos?: { docDedRed?: UmOuVarios<NFSeDocDedRed> } };
    /** Leiaute da NT 009: ajuste da base de cálculo por percentual, valor ou documentos. */
    vAjusteBC?: {
        pAjusteBCISSQN?: Escalar;
        vAjusteBCISSQN?: Escalar;
        documentos?: { docAjusteBC?: UmOuVarios<NFSeDocAjusteBC> };
    };
    trib?: {
        tribMun?: NFSeTribMun;
        tribFed?: NFSeTribFed;
        totTrib?: NFSeTotTrib;
    };
}

export interface NFSeServico {
    locPrest?: { cLocPrestacao?: string; cPaisPrestacao?: string; opConsumoBR?: Escalar };
    cServ?: { cTribNac?: string; cTribMun?: string; xDescServ?: string; cNBS?: string; cIntContrib?: string };
    infoCompl?: { idDocTec?: string; docRef?: string; xInfComp?: string };
}

export interface NFSeInfDPS {
    Id?: string;
    tpAmb?: Escalar;
    dhEmi?: string;
    verAplic?: string;
    serie?: string;
    nDPS?: Escalar;
    dCompet?: string;
    tpEmit?: Escalar;
    cLocEmi?: string;
    subst?: { chSubstda?: string; cMotivo?: Escalar; xMotivo?: string };
    /** Só existe na DPS da NT 009: é o que diferencia os dois leiautes no XML. */
    finNFSe?: Escalar;
    prest?: NFSePessoa;
    toma?: NFSePessoa;
    interm?: NFSePessoa;
    serv?: NFSeServico;
    valores?: NFSeValoresDPS;
}

export interface NFSeValoresNota {
    vCalcDR?: Escalar;
    vCalcAjusteBCISSQN?: Escalar;
    tpBM?: Escalar;
    vCalcBM?: Escalar;
    vBC?: Escalar;
    pAliqAplic?: Escalar;
    vISSQN?: Escalar;
    vTotalRet?: Escalar;
    vLiq?: Escalar;
}

/** Nó `infNFSe` da NFSe (padrão nacional). */
export interface InfNFSe {
    Id?: string;
    xLocEmi?: string;
    xLocPrestacao?: string;
    nNFSe?: Escalar;
    cLocIncid?: string;
    xLocIncid?: string;
    xTribNac?: string;
    xTribMun?: string;
    xNBS?: string;
    verAplic?: string;
    ambGer?: Escalar;
    tpEmis?: Escalar;
    procEmi?: Escalar;
    cStat?: Escalar;
    dhProc?: string;
    nDFSe?: Escalar;
    emit?: NFSePessoa;
    valores?: NFSeValoresNota;
    DPS?: { infDPS?: NFSeInfDPS };
}

export interface NFSeDocumento {
    infNFSe: InfNFSe;
    Signature?: unknown;
}

/** Parâmetros para gerar a DANFSe localmente a partir do XML da NFSe. */
export interface NFSeGerarDanfeFromXmlProps {
    /**
     * XML da NFSe (nó `NFSe`/`infNFSe`). Aceita também o conteúdo devolvido
     * pelo Ambiente de Dados Nacional em `nfseXmlGZipB64` (GZip + Base64)
     * ou o XML em Base64 puro.
     */
    data: string;

    /**
     * Caminho completo onde o PDF será salvo
     */
    outputPath: string;

    /**
     * Chave de acesso. Opcional — por padrão é lida do atributo `Id` de `infNFSe`.
     */
    chave?: string;

    /**
     * Exibe a marca d'água "NFeWizard-io" no rodapé. Padrão: `true`.
     */
    exibirMarcaDaguaDanfe?: boolean;

    /**
     * URL base da consulta pública impressa no rodapé e usada no QR Code.
     * Padrão: portal nacional da NFS-e.
     */
    urlConsulta?: string;
}

export type NFSeGerarDanfeProps = NFSeGerarDanfeFromXmlProps;

/** Parâmetros aceitos pelo gerador da DANFSe a partir do JSON já parseado. */
export interface NFSeDanfeGeneratorProps {
    data: NFSeDocumento | InfNFSe;
    outputPath: string;
    chave?: string;
    exibirMarcaDaguaDanfe?: boolean;
    urlConsulta?: string;
}

type DanfseCell = {
    /** Rótulo do campo (impresso em caixa alta). */
    label: string;
    /** Conteúdo do campo. */
    value?: string;
    /** Proporção da largura da linha (padrão: divisão igualitária). */
    flex?: number;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    /** Permite que a célula cresça verticalmente conforme o texto. */
    grow?: boolean;
    /** Cor de preenchimento da célula (destaques). */
    fill?: string;
    fontSize?: number;
};

const URL_CONSULTA_NACIONAL = 'https://www.nfse.gov.br/consultapublica';

/** `tpRetPisCofins` do leiaute 1.01 (XSD `TCTribOutrosPisCofins`): só retido ou não retido. */
const TP_RET_PIS_COFINS_1_01: Record<string, string> = {
    '1': 'PIS/COFINS RETIDOS',
    '2': 'PIS/COFINS NÃO RETIDOS',
};

/** `tpRetPisCofins` da NT 009 (release 1): dez combinações, a CSLL entra no código. */
const TP_RET_PIS_COFINS_NT009: Record<string, string> = {
    '0': 'PIS/COFINS/CSLL NÃO RETIDOS',
    '1': 'PIS/COFINS RETIDOS',
    '2': 'PIS/COFINS NÃO RETIDOS',
    '3': 'PIS/COFINS/CSLL RETIDOS',
    '4': 'PIS/COFINS RETIDOS, CSLL NÃO RETIDO',
    '5': 'PIS RETIDO, COFINS/CSLL NÃO RETIDOS',
    '6': 'COFINS RETIDO, PIS/CSLL NÃO RETIDOS',
    '7': 'PIS NÃO RETIDO, COFINS/CSLL RETIDOS',
    '8': 'PIS/COFINS NÃO RETIDOS, CSLL RETIDO',
    '9': 'COFINS NÃO RETIDO, PIS/CSLL RETIDOS',
};

/** `tpDedRed` do leiaute 1.01. */
const TP_DED_RED_1_01: Record<string, string> = {
    '1': 'ALIMENTAÇÃO E BEBIDAS/FRIGOBAR',
    '2': 'MATERIAIS',
    '3': 'PRODUÇÃO EXTERNA',
    '4': 'REEMBOLSO DE DESPESAS',
    '5': 'REPASSE CONSORCIADO',
    '6': 'REPASSE PLANO DE SAÚDE',
    '7': 'SERVIÇOS',
    '8': 'SUBEMPREITADA DE MÃO DE OBRA',
    '9': 'PROFISSIONAL PARCEIRO',
    '99': 'OUTRAS DEDUÇÕES',
};

/** `tpAjusteBC` da NT 009. */
const TP_AJUSTE_BC_NT009: Record<string, string> = {
    '2': 'MATERIAIS',
    '5': 'REPASSE CONSORCIADO',
    '6': 'REPASSE PLANO DE SAÚDE',
    '7': 'SERVIÇOS',
    '8': 'SUBEMPREITADA DE MÃO DE OBRA',
    '9': 'PROFISSIONAL PARCEIRO',
    '99': 'OUTRAS DEDUÇÕES EXCLUSIVAS DO ISSQN',
    '101': 'REPASSE DE REMUNERAÇÃO POR INTERMEDIAÇÃO DE IMÓVEIS A DEMAIS CORRETORES',
    '102': 'REPASSE A FORNECEDOR DE FORNECIMENTO INTERMEDIADO POR AGÊNCIA DE TURISMO',
    '103': 'REEMBOLSO A AGÊNCIA DE PROPAGANDA: PRODUÇÃO EXTERNA POR CONTA E ORDEM DE TERCEIRO',
    '104': 'REEMBOLSO A AGÊNCIA DE PROPAGANDA: MÍDIA POR CONTA E ORDEM DE TERCEIRO',
    '105': 'GLOSA DE SERVIÇOS DE SAÚDE',
    '199': 'OUTROS REEMBOLSOS OU RESSARCIMENTOS POR CONTA E ORDEM DE TERCEIRO',
};

/** `tpBM` do grupo `valores` da NFS-e (tipo do benefício municipal aplicado). */
const TP_BM: Record<string, string> = {
    '1': 'ISENÇÃO',
    '2': 'REDUÇÃO DA BC EM PERCENTUAL',
    '3': 'REDUÇÃO DA BC EM VALOR',
    '4': 'ALÍQUOTA DIFERENCIADA',
};

/** Linha de documento de dedução/redução já normalizada entre os dois leiautes. */
interface DocumentoDeducaoImpresso {
    tipo: string;
    referencia: string;
    emissao: string;
    valorDocumento: Escalar;
    valorDeduzido: Escalar;
}

/** Dedução/redução da base do ISSQN já normalizada entre os dois leiautes. */
interface DeducaoImpressa {
    percentual?: Escalar;
    valor: number;
    documentos: DocumentoDeducaoImpresso[];
}

/**
 * Gerador da DANFSe (Documento Auxiliar da NFS-e) em PDF a partir do JSON da
 * NFSe do padrão nacional.
 *
 * Use {@link NFSeGerarDanfeFromXml} quando tiver o XML em mãos.
 */
class NFSeDanfeGenerator {
    infNFSe: InfNFSe;
    infDPS: NFSeInfDPS;
    chave: string;
    outputPath: string;
    urlConsulta: string;
    exibirMarcaDaguaDanfe: boolean;
    documento: ValidaCPFCNPJ;
    doc: InstanceType<typeof PDFDocument>;
    qrcodeBuffer: Buffer | null = null;

    private y: number;
    private left: number;
    private usableWidth: number;

    constructor(props: NFSeDanfeGeneratorProps) {
        const { data, outputPath, chave, exibirMarcaDaguaDanfe, urlConsulta } = props;

        this.infNFSe = (data as NFSeDocumento)?.infNFSe ?? (data as InfNFSe) ?? {};
        this.infDPS = this.infNFSe.DPS?.infDPS ?? {};
        this.chave = String(chave || this.infNFSe.Id || '').replace(/^NFS/, '').trim();
        this.outputPath = outputPath;
        this.urlConsulta = urlConsulta || URL_CONSULTA_NACIONAL;
        this.exibirMarcaDaguaDanfe = exibirMarcaDaguaDanfe ?? true;
        this.documento = new ValidaCPFCNPJ();

        this.doc = new PDFDocument({
            // 5 mm nas laterais mantém a área útil anterior, mas centraliza o
            // documento na página e melhora a segurança durante a impressão.
            margins: { top: 22, right: 14.17, bottom: 12, left: 14.17 },
            size: 'a4', // 595.28 * 841.89
            bufferPages: true,
            layout: 'portrait',
            font: 'Times-Roman',
        });

        this.left = this.doc.page.margins.left;
        this.usableWidth = this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
        this.y = this.doc.page.margins.top;
    }

    /* ------------------------------------------------------------------ *
     * Helpers de formatação
     * ------------------------------------------------------------------ */

    /** Converte valores vindos do XML em texto (nós vazios viram string vazia). */
    str(value: unknown): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return '';
        return String(value)
            .replace(/\\r\\n/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\n')
            .replace(/\r\n?/g, '\n')
            .trim();
    }

    /** Converte um `Escalar` (string em formato BR ou já numérico) para `number`. */
    parseDecimal(value: Escalar): number {
        const valueText = this.str(value) || '0';
        const normalizedValue = valueText.includes(',') ? valueText.replace(/\./g, '').replace(',', '.') : valueText;
        const parsedValue = parseFloat(normalizedValue);
        return Number.isNaN(parsedValue) ? 0 : parsedValue;
    }

    formatDecimal(value: Escalar, minimumFractionDigits = 2, maximumFractionDigits = 2): string {
        return this.parseDecimal(value).toLocaleString('pt-BR', {
            minimumFractionDigits,
            maximumFractionDigits,
        });
    }

    formatDateTime(value: Escalar): string {
        const text = this.str(value);
        if (!text) return '';
        try {
            return format(parseISO(text), 'dd/MM/yyyy HH:mm:ss');
        } catch {
            return text;
        }
    }

    formatCompetencia(value: Escalar): string {
        const text = this.str(value);
        if (!text) return '';
        try {
            return format(parseISO(text), 'MM/yyyy');
        } catch {
            return text;
        }
    }

    /** Quebra a chave de acesso em blocos de 4 para facilitar a leitura. */
    formatChave(chave: string): string {
        return chave.replace(/(.{4})/g, '$1 ').trim();
    }

    formatDocumento(pessoa?: NFSePessoa): string {
        if (!pessoa) return '';
        const doc = this.str(pessoa.CNPJ) || this.str(pessoa.CPF);
        if (doc) return this.documento.mascaraCnpjCpf(doc);
        return this.str(pessoa.NIF) || this.str(pessoa.CAEPF);
    }

    /** Endereço normalizado — cobre tanto `emit.enderNac` quanto `prest`/`toma`.`end`. */
    private getEndereco(pessoa?: NFSePessoa): NFSeEnderecoNacional & { xCidadeExt?: string } {
        if (!pessoa) return {};
        if (pessoa.enderNac) return pessoa.enderNac;

        const end = pessoa.end;
        if (!end) return {};

        return {
            xLgr: end.xLgr,
            nro: end.nro,
            xCpl: end.xCpl,
            xBairro: end.xBairro,
            cMun: end.endNac?.cMun,
            xMun: end.endNac?.xMun,
            UF: end.endNac?.UF,
            CEP: end.endNac?.CEP,
            xCidadeExt: end.endExt?.xCidade,
        };
    }

    private getLogradouro(pessoa?: NFSePessoa): string {
        const end = this.getEndereco(pessoa);
        return [this.str(end.xLgr), this.str(end.nro), this.str(end.xCpl)].filter(Boolean).join(', ');
    }

    private getMunicipio(pessoa?: NFSePessoa): string {
        const end = this.getEndereco(pessoa);
        const nomeInformado = this.str(end.xMun) || this.str(end.xCidadeExt);
        if (nomeInformado) return nomeInformado;

        const codigoMunicipio = this.str(end.cMun);
        if (!codigoMunicipio) return '';

        if (codigoMunicipio === this.str(this.infDPS.cLocEmi) && this.str(this.infNFSe.xLocEmi)) {
            return this.str(this.infNFSe.xLocEmi);
        }

        if (
            codigoMunicipio === this.str(this.infDPS.serv?.locPrest?.cLocPrestacao)
            && this.str(this.infNFSe.xLocPrestacao)
        ) {
            return this.str(this.infNFSe.xLocPrestacao);
        }

        if (codigoMunicipio === this.str(this.infNFSe.cLocIncid) && this.str(this.infNFSe.xLocIncid)) {
            return this.str(this.infNFSe.xLocIncid);
        }

        return codigoMunicipio;
    }

    private formatCEP(value: Escalar): string {
        const cep = this.str(value).replace(/\D/g, '');
        if (cep.length !== 8) return this.str(value);
        return `${cep.slice(0, 5)}-${cep.slice(5)}`;
    }

    /** Traduz códigos do layout (ex.: `1` -> `1 - PRODUÇÃO`). */
    private getDescricao(mapa: Record<string, string>, value: Escalar): string {
        const key = this.str(value);
        if (!key) return '';
        return mapa[key] ? `${key} - ${mapa[key]}` : key;
    }

    formatData(value: Escalar): string {
        const text = this.str(value);
        if (!text) return '';
        try {
            return format(parseISO(text), 'dd/MM/yyyy');
        } catch {
            return text;
        }
    }

    private lista<T>(valor: UmOuVarios<T> | undefined | null): T[] {
        if (valor === undefined || valor === null || (valor as unknown) === '') return [];
        return Array.isArray(valor) ? valor : [valor];
    }

    /**
     * A DPS da NT 009 é a única com `finNFSe`, `vAjusteBC` e, na NFS-e, `vCalcAjusteBCISSQN`;
     * qualquer um deles basta para saber qual dicionário de códigos usar.
     */
    private get leiauteNt009(): boolean {
        return this.infDPS.finNFSe !== undefined
            || this.infDPS.valores?.vAjusteBC !== undefined
            || this.infNFSe.valores?.vCalcAjusteBCISSQN !== undefined;
    }

    /** Descrição do `tpRetPisCofins` no leiaute em vigor na nota; fora do domínio, só o código. */
    private getDescricaoTpRetPisCofins(value: Escalar): string {
        return this.getDescricao(this.leiauteNt009 ? TP_RET_PIS_COFINS_NT009 : TP_RET_PIS_COFINS_1_01, value);
    }

    private referenciaDocDedRed(doc: NFSeDocDedRed): string {
        if (this.str(doc.chNFSe)) return `NFS-e ${this.str(doc.chNFSe)}`;
        if (this.str(doc.chNFe)) return `NF-e ${this.str(doc.chNFe)}`;
        if (doc.NFSeMun) {
            const n = doc.NFSeMun;
            return `NFS-e municipal nº ${this.str(n.nNFSeMun)} (município ${this.str(n.cMunNFSeMun)}, verificação ${this.str(n.cVerifNFSeMun)})`;
        }
        if (doc.NFNFS) {
            const n = doc.NFNFS;
            return `NF/NFS nº ${this.str(n.nNFS)}, modelo ${this.str(n.modNFS)}, série ${this.str(n.serieNFS)}`;
        }
        if (this.str(doc.nDocFisc)) return `Documento fiscal nº ${this.str(doc.nDocFisc)}`;
        if (this.str(doc.nDoc)) return `Documento nº ${this.str(doc.nDoc)}`;
        return '';
    }

    private referenciaDocAjusteBC(doc: NFSeDocAjusteBC): string {
        if (doc.dFeNacional) {
            const d = doc.dFeNacional;
            const nome = this.str(d.xTipoChaveDFe) || 'DF-e';
            return `${nome} ${this.str(d.chaveDFe)}`;
        }
        if (doc.docFiscalOutro) {
            const d = doc.docFiscalOutro;
            return `${this.str(d.xDocFiscal)} nº ${this.str(d.nDocFiscal)} (município ${this.str(d.cMunDocFiscal)})`;
        }
        if (doc.docOutro) {
            return `${this.str(doc.docOutro.xDoc)} nº ${this.str(doc.docOutro.nDoc)}`;
        }
        return '';
    }

    /** Une o que a DPS informou (valor, percentual, documentos) ao que a Sefin calculou na NFS-e. */
    private getDeducao(): DeducaoImpressa {
        const dps = this.infDPS.valores;
        const nota = this.infNFSe.valores;
        const nt009 = this.leiauteNt009;

        const documentos: DocumentoDeducaoImpresso[] = nt009
            ? this.lista(dps?.vAjusteBC?.documentos?.docAjusteBC).map((doc) => {
                const codigo = this.str(doc.tpAjusteBC);
                const tipo = this.getDescricao(TP_AJUSTE_BC_NT009, codigo);
                const complemento = this.str(doc.xTpAjusteBC);
                return {
                    tipo: complemento ? `${tipo} - ${complemento}` : tipo,
                    referencia: this.referenciaDocAjusteBC(doc),
                    emissao: this.formatData(doc.dtEmiDoc),
                    valorDocumento: doc.vTotDoc,
                    valorDeduzido: doc.vAjusteAplic,
                };
            })
            : this.lista(dps?.vDedRed?.documentos?.docDedRed).map((doc) => {
                const codigo = this.str(doc.tpDedRed);
                const tipo = this.getDescricao(TP_DED_RED_1_01, codigo);
                const complemento = this.str(doc.xDescOutDed);
                return {
                    tipo: complemento ? `${tipo} - ${complemento}` : tipo,
                    referencia: this.referenciaDocDedRed(doc),
                    emissao: this.formatData(doc.dtEmiDoc),
                    valorDocumento: doc.vDedutivelRedutivel,
                    valorDeduzido: doc.vDeducaoReducao,
                };
            });

        const informado = nt009 ? dps?.vAjusteBC?.vAjusteBCISSQN : dps?.vDedRed?.vDR;
        const calculado = nt009 ? nota?.vCalcAjusteBCISSQN : nota?.vCalcDR;
        const percentual = nt009 ? dps?.vAjusteBC?.pAjusteBCISSQN : dps?.vDedRed?.pDR;

        let valor: number;
        if (this.str(informado)) valor = this.parseDecimal(informado);
        else if (this.str(calculado)) valor = this.parseDecimal(calculado);
        else valor = documentos.reduce((soma, doc) => soma + this.parseDecimal(doc.valorDeduzido), 0);

        return { percentual: this.str(percentual) ? percentual : undefined, valor, documentos };
    }

    /* ------------------------------------------------------------------ *
     * Helpers de desenho
     * ------------------------------------------------------------------ */

    setLineStyle(lineWidth = 0.75, strokeColor = '#1c1c1c') {
        this.doc.lineWidth(lineWidth).strokeColor(strokeColor).fillColor('black');
    }

    private resolveWidths(cells: DanfseCell[]): number[] {
        const totalFlex = cells.reduce((sum, cell) => sum + (cell.flex ?? 1), 0);
        const widths = cells.map(cell => ((cell.flex ?? 1) / totalFlex) * this.usableWidth);
        const diff = this.usableWidth - widths.reduce((sum, width) => sum + width, 0);
        widths[widths.length - 1] += diff;
        return widths;
    }

    /** Quebra a página quando o bloco a ser desenhado não couber no espaço restante. */
    private ensureSpace(height: number) {
        const limit = this.doc.page.height - this.doc.page.margins.bottom - 24;
        if (this.y + height <= limit) return;

        this.doc.addPage();
        this.y = this.doc.page.margins.top;
    }

    private sectionTitle(title: string) {
        const marginTop = 3;
        const titleHeight = 10;
        const marginBottom = 2;

        // Evita deixar o título isolado no fim da página sem ao menos a
        // primeira linha da seção correspondente.
        this.ensureSpace(marginTop + titleHeight + marginBottom + 23);
        this.y += marginTop;

        this.doc.save();
        this.doc.rect(this.left, this.y, this.usableWidth, titleHeight).fill('#EEEEEE');
        this.doc.fillColor('black').font('Times-Bold').fontSize(6.5).text(title, this.left + 3, this.y + 2.2, {
            characterSpacing: 0.5,
            width: this.usableWidth - 6,
            lineBreak: false,
        });
        this.doc.restore();

        this.y += titleHeight + marginBottom;
    }

    /** Desenha uma linha de células rotuladas, no estilo dos quadros do DANFE. */
    private drawRow(cells: DanfseCell[], minHeight = 23) {
        const widths = this.resolveWidths(cells);

        let height = minHeight;
        cells.forEach((cell, index) => {
            if (!cell.grow) return;
            this.doc.font(cell.bold ? 'Times-Bold' : 'Times-Roman').fontSize(cell.fontSize ?? 8);
            const textHeight = this.doc.heightOfString(cell.value || ' ', {
                width: widths[index] - 6,
                characterSpacing: 0.4,
                lineGap: 1,
            });
            height = Math.max(height, textHeight + 15);
        });

        this.ensureSpace(height);

        let x = this.left;
        cells.forEach((cell, index) => {
            const width = widths[index];

            this.setLineStyle();
            if (cell.fill) {
                this.doc.rect(x, this.y, width, height).fillAndStroke(cell.fill, '#1c1c1c');
                this.setLineStyle();
            } else {
                this.doc.rect(x, this.y, width, height).stroke();
            }

            this.doc.fillColor('black').font('Times-Roman').fontSize(5).text(cell.label.toUpperCase(), x + 3, this.y + 3, {
                width: width - 6,
                characterSpacing: 0.4,
                lineBreak: false,
                ellipsis: true,
            });

            const value = cell.value ?? '';
            if (value) {
                this.doc.font(cell.bold ? 'Times-Bold' : 'Times-Roman').fontSize(cell.fontSize ?? 8).text(value, x + 3, this.y + 11, {
                    width: width - 6,
                    height: Math.max(height - 14, 1),
                    align: cell.align ?? 'left',
                    characterSpacing: 0.4,
                    lineBreak: cell.grow ?? false,
                    ellipsis: !cell.grow,
                    lineGap: 1,
                });
            }

            x += width;
        });

        this.y += height;
    }

    async generateQRCode(text: string): Promise<Buffer | null> {
        try {
            const buffer = await QRCode.toBuffer(text, {
                color: { dark: '#000000', light: '#FFFFFF' },
                margin: 1,
                width: 300,
            });
            this.qrcodeBuffer = buffer;
            return buffer;
        } catch (error: any) {
            logger.warn('Não foi possível gerar o QR Code da DANFSe', {
                context: 'NFSeDanfeGenerator',
                message: error.message,
            });
            this.qrcodeBuffer = null;
            return null;
        }
    }

    /* ------------------------------------------------------------------ *
     * Blocos da DANFSe
     * ------------------------------------------------------------------ */

    _buildCabecalho() {
        const headerHeight = 70;
        const qrBoxWidth = 82;
        const infoBoxWidth = this.usableWidth - qrBoxWidth;

        this.ensureSpace(headerHeight);
        this.setLineStyle();

        this.doc.rect(this.left, this.y, infoBoxWidth, headerHeight).stroke();
        this.doc.rect(this.left + infoBoxWidth, this.y, qrBoxWidth, headerHeight).stroke();

        const municipio = this.str(this.infNFSe.xLocEmi);
        this.doc.fillColor('black').font('Times-Bold').fontSize(10).text(
            municipio ? `PREFEITURA MUNICIPAL DE ${municipio.toUpperCase()}` : 'PREFEITURA MUNICIPAL',
            this.left, this.y + 8,
            { width: infoBoxWidth, align: 'center', characterSpacing: 0.5, lineBreak: false, ellipsis: true },
        );
        this.doc.font('Times-Bold').fontSize(11).text('NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e', this.left, this.y + 24, {
            width: infoBoxWidth,
            align: 'center',
            characterSpacing: 0.5,
            lineBreak: false,
        });
        this.doc.font('Times-Roman').fontSize(7).text('DANFSe - Documento Auxiliar da Nota Fiscal de Serviços Eletrônica', this.left, this.y + 40, {
            width: infoBoxWidth,
            align: 'center',
            characterSpacing: 0.5,
            lineBreak: false,
        });
        this.doc.font('Times-Roman').fontSize(6.5).text(`Consulta de autenticidade em ${this.urlConsulta}`, this.left, this.y + 53, {
            width: infoBoxWidth,
            align: 'center',
            characterSpacing: 0.3,
            lineBreak: false,
        });

        if (this.qrcodeBuffer) {
            this.doc.image(this.qrcodeBuffer, this.left + infoBoxWidth + 11, this.y + 4, { width: 60, height: 60 });
        } else {
            this.doc.font('Times-Roman').fontSize(6).text('QR Code indisponível', this.left + infoBoxWidth, this.y + 32, {
                width: qrBoxWidth,
                align: 'center',
                lineBreak: false,
            });
        }

        this.y += headerHeight;
    }

    _buildIdentificacao() {
        this.drawRow([
            { label: 'Número da NFS-e', value: this.str(this.infNFSe.nNFSe), flex: 1.1, bold: true },
            { label: 'Competência', value: this.formatCompetencia(this.infDPS.dCompet), flex: 0.8 },
            { label: 'Data e hora da emissão', value: this.formatDateTime(this.infDPS.dhEmi), flex: 1.3 },
            { label: 'Data e hora do processamento', value: this.formatDateTime(this.infNFSe.dhProc), flex: 1.3 },
            {
                label: 'Nº DPS / Série',
                value: [this.str(this.infDPS.nDPS), this.str(this.infDPS.serie)].filter(Boolean).join(' / '),
                flex: 1,
            },
        ]);

        this.drawRow([
            { label: 'Chave de acesso da NFS-e', value: this.formatChave(this.chave), flex: 2.6, fontSize: 7.5 },
            {
                label: 'Ambiente',
                value: this.getDescricao({ '1': 'PRODUÇÃO', '2': 'HOMOLOGAÇÃO' }, this.infDPS.tpAmb),
                flex: 0.85,
            },
            {
                label: 'Emitente do DPS',
                value: this.getDescricao({ '1': 'PRESTADOR', '2': 'TOMADOR', '3': 'INTERMEDIÁRIO' }, this.infDPS.tpEmit),
                flex: 0.95,
            },
        ]);
    }

    /** Desenha um bloco de pessoa (prestador, tomador ou intermediário). */
    private _buildPessoa(titulo: string, pessoa: NFSePessoa | undefined, options?: { regimeTributario?: boolean }) {
        this.sectionTitle(titulo);

        const end = this.getEndereco(pessoa);

        this.drawRow([
            { label: 'Nome / Razão Social', value: this.str(pessoa?.xNome), flex: 2.2, grow: true },
            { label: 'CNPJ / CPF', value: this.formatDocumento(pessoa), flex: 1 },
            { label: 'Inscrição Municipal', value: this.str(pessoa?.IM), flex: 0.8, grow: true },
        ]);

        this.drawRow([
            { label: 'Endereço', value: this.getLogradouro(pessoa), flex: 2.2, grow: true },
            { label: 'Bairro', value: this.str(end.xBairro), flex: 1, grow: true },
            { label: 'CEP', value: this.formatCEP(end.CEP), flex: 0.8 },
        ]);

        this.drawRow([
            { label: 'Município', value: this.getMunicipio(pessoa), flex: 1.4, grow: true },
            { label: 'UF', value: this.str(end.UF), flex: 0.3 },
            { label: 'Telefone', value: this.str(pessoa?.fone), flex: 0.9 },
            { label: 'E-mail', value: this.str(pessoa?.email), flex: 1.6, grow: true },
        ]);

        if (options?.regimeTributario) {
            const regTrib = pessoa?.regTrib;
            this.drawRow([
                {
                    label: 'Simples Nacional',
                    value: this.getDescricao({
                        '1': 'NÃO OPTANTE',
                        '2': 'OPTANTE - MEI',
                        '3': 'OPTANTE - ME/EPP',
                    }, regTrib?.opSimpNac),
                    flex: 1,
                    fontSize: 7,
                },
                {
                    label: 'Regime de apuração (Simples Nacional)',
                    value: this.getDescricao({
                        '1': 'TRIBUTOS FEDERAIS E MUNICIPAL PELO SN',
                        '2': 'TRIBUTOS FEDERAIS PELO SN E ISSQN POR FORA',
                        '3': 'TRIBUTOS FEDERAIS E MUNICIPAL POR FORA DO SN',
                    }, regTrib?.regApTribSN),
                    flex: 1.4,
                    fontSize: 6.5,
                },
                {
                    label: 'Regime especial de tributação',
                    value: this.getDescricao({
                        '0': 'NENHUM',
                        '1': 'ATO COOPERADO',
                        '2': 'ESTIMATIVA',
                        '3': 'MICROEMPRESA MUNICIPAL',
                        '4': 'NOTÁRIOS E REGISTRADORES',
                        '5': 'PROFISSIONAL AUTÔNOMO',
                        '6': 'SOCIEDADE DE PROFISSIONAIS',
                    }, regTrib?.regEspTrib),
                    flex: 1.2,
                    fontSize: 6.5,
                },
            ]);
        }
    }

    _buildPrestador() {
        // O nó `emit` da NFSe traz o prestador já consolidado pelo ambiente nacional;
        // `prest` (DPS) complementa o que o emitente informou no envio.
        const emit = this.infNFSe.emit;
        const prest = this.infDPS.prest;
        const pessoa: NFSePessoa = {
            ...prest,
            ...emit,
            regTrib: prest?.regTrib ?? emit?.regTrib,
        };

        this._buildPessoa('PRESTADOR DE SERVIÇOS (EMITENTE)', pessoa, { regimeTributario: true });

        const xFant = this.str(emit?.xFant) || this.str(prest?.xFant);
        if (xFant) {
            this.drawRow([{ label: 'Nome Fantasia', value: xFant, grow: true }]);
        }
    }

    _buildTomador() {
        this._buildPessoa('TOMADOR DE SERVIÇOS', this.infDPS.toma);
    }

    _buildIntermediario() {
        if (!this.infDPS.interm) return;
        this._buildPessoa('INTERMEDIÁRIO DE SERVIÇOS', this.infDPS.interm);
    }

    _buildServico() {
        const cServ = this.infDPS.serv?.cServ;
        const locPrest = this.infDPS.serv?.locPrest;

        this.sectionTitle('SERVIÇO PRESTADO');

        this.drawRow([
            { label: 'Cód. tributação nacional', value: this.str(cServ?.cTribNac), flex: 1 },
            { label: 'Cód. tributação municipal', value: this.str(cServ?.cTribMun), flex: 1 },
            { label: 'Código NBS', value: this.str(cServ?.cNBS), flex: 1 },
            {
                label: 'Local da prestação',
                value: this.str(this.infNFSe.xLocPrestacao) || this.str(locPrest?.cLocPrestacao) || this.str(locPrest?.cPaisPrestacao),
                flex: 1.5,
                grow: true,
            },
            {
                label: 'Município de incidência do ISSQN',
                value: this.str(this.infNFSe.xLocIncid) || this.str(this.infNFSe.cLocIncid),
                flex: 1.5,
                grow: true,
            },
        ]);

        const servicoNacional = this.str(this.infNFSe.xTribNac);
        if (servicoNacional) {
            this.drawRow([{ label: 'Serviço prestado (tributação nacional)', value: servicoNacional, grow: true }], 21);
        }

        const servicoMunicipal = this.str(this.infNFSe.xTribMun);
        if (servicoMunicipal) {
            this.drawRow([{ label: 'Serviço prestado (tributação municipal)', value: servicoMunicipal, grow: true }], 21);
        }

        this.drawRow([{ label: 'Descrição do serviço', value: this.str(cServ?.xDescServ), grow: true }], 45);
    }

    _buildTributacaoMunicipal() {
        const valores = this.infDPS.valores;
        const tribMun = valores?.trib?.tribMun;
        const valoresNota = this.infNFSe.valores;

        this.sectionTitle('TRIBUTAÇÃO MUNICIPAL (ISSQN)');

        this.drawRow([
            {
                label: 'Tributação do ISSQN',
                value: this.getDescricao({
                    '1': 'OPERAÇÃO TRIBUTÁVEL',
                    '2': 'IMUNIDADE',
                    '3': 'EXPORTAÇÃO DE SERVIÇO',
                    '4': 'NÃO INCIDÊNCIA',
                }, tribMun?.tribISSQN),
                flex: 1.5,
                fontSize: 7,
            },
            {
                label: 'Retenção do ISSQN',
                value: this.getDescricao({
                    '1': 'NÃO RETIDO',
                    '2': 'RETIDO PELO TOMADOR',
                    '3': 'RETIDO PELO INTERMEDIÁRIO',
                }, tribMun?.tpRetISSQN),
                flex: 1.5,
                fontSize: 7,
            },
            { label: 'Valor do serviço', value: this.formatDecimal(valores?.vServPrest?.vServ), flex: 1, align: 'right' },
            { label: 'Desconto incondicionado', value: this.formatDecimal(valores?.vDescCondIncond?.vDescIncond), flex: 1, align: 'right' },
            { label: 'Desconto condicionado', value: this.formatDecimal(valores?.vDescCondIncond?.vDescCond), flex: 1, align: 'right' },
        ]);

        const deducao = this.getDeducao();
        const deducaoCells: DanfseCell[] = [
            { label: 'Deduções / Reduções', value: this.formatDecimal(deducao.valor), flex: 1, align: 'right' },
        ];
        if (deducao.percentual !== undefined) {
            deducaoCells.push({
                label: 'Dedução / redução (%)',
                value: this.formatDecimal(deducao.percentual, 2, 4),
                flex: 0.8,
                align: 'right',
            });
        }

        this.drawRow([
            ...deducaoCells,
            { label: 'Base de cálculo', value: this.formatDecimal(valoresNota?.vBC), flex: 1, align: 'right' },
            {
                label: 'Alíquota (%)',
                value: this.formatDecimal(valoresNota?.pAliqAplic ?? tribMun?.pAliq, 2, 4),
                flex: 0.8,
                align: 'right',
            },
            { label: 'ISSQN apurado', value: this.formatDecimal(valoresNota?.vISSQN), flex: 1, align: 'right' },
            { label: 'Total de retenções', value: this.formatDecimal(valoresNota?.vTotalRet), flex: 1, align: 'right' },
        ]);

        this._buildBeneficioMunicipal();
        this._buildDocumentosDeducao(deducao.documentos);
    }

    /** Benefício municipal: o que o emitente pediu (`tribMun.BM`) e o que a Sefin aplicou (`valores`). */
    _buildBeneficioMunicipal() {
        const bm = this.infDPS.valores?.trib?.tribMun?.BM;
        const valoresNota = this.infNFSe.valores;
        const tpBM = this.str(valoresNota?.tpBM);
        const vCalcBM = this.str(valoresNota?.vCalcBM);
        if (!bm && !tpBM && !vCalcBM) return;

        const cells: DanfseCell[] = [
            { label: 'Benefício municipal (nº)', value: this.str(bm?.nBM), flex: 1.4, fontSize: 7 },
            { label: 'Tipo do benefício', value: this.getDescricao(TP_BM, tpBM), flex: 1.6, fontSize: 7, grow: true },
        ];
        if (this.str(bm?.pRedBCBM)) {
            cells.push({
                label: 'Redução da base informada (%)',
                value: this.formatDecimal(bm?.pRedBCBM, 2, 4),
                flex: 1,
                align: 'right',
            });
        }
        if (this.str(bm?.vRedBCBM)) {
            cells.push({
                label: 'Redução da base informada (R$)',
                value: this.formatDecimal(bm?.vRedBCBM),
                flex: 1,
                align: 'right',
            });
        }
        cells.push({ label: 'Valor da redução (R$)', value: this.formatDecimal(vCalcBM), flex: 1, align: 'right' });
        this.drawRow(cells);
    }

    /** Uma linha por documento que sustenta a dedução/redução da base. */
    _buildDocumentosDeducao(documentos: DocumentoDeducaoImpresso[]) {
        if (documentos.length === 0) return;

        this.sectionTitle('DOCUMENTOS DE DEDUÇÃO / REDUÇÃO DA BASE');
        for (const doc of documentos) {
            this.drawRow([
                { label: 'Tipo', value: doc.tipo, flex: 2, fontSize: 6.5, grow: true },
                { label: 'Documento', value: doc.referencia, flex: 3.4, fontSize: 6.5, grow: true },
                { label: 'Emissão', value: doc.emissao, flex: 0.9, fontSize: 7 },
                { label: 'Valor do doc.', value: this.formatDecimal(doc.valorDocumento), flex: 1, align: 'right' },
                { label: 'Valor deduzido', value: this.formatDecimal(doc.valorDeduzido), flex: 1, align: 'right' },
            ]);
        }
    }

    _buildTributacaoFederal() {
        const tribFed = this.infDPS.valores?.trib?.tribFed;
        if (!tribFed) return;

        const piscofins = tribFed.piscofins;

        this.sectionTitle('TRIBUTAÇÃO FEDERAL (RETENÇÕES)');

        this.drawRow([
            { label: 'PIS', value: this.formatDecimal(piscofins?.vPis), align: 'right' },
            { label: 'COFINS', value: this.formatDecimal(piscofins?.vCofins), align: 'right' },
            { label: 'IRRF', value: this.formatDecimal(tribFed.vRetIRRF), align: 'right' },
            { label: 'CSLL', value: this.formatDecimal(tribFed.vRetCSLL), align: 'right' },
            { label: 'CP / INSS', value: this.formatDecimal(tribFed.vRetCP), align: 'right' },
            { label: 'Total de retenções', value: this.formatDecimal(this.infNFSe.valores?.vTotalRet), align: 'right' },
        ]);

        // O código de retenção pode descrever até três tributos ("PIS RETIDO, COFINS/CSLL NÃO RETIDOS"):
        // ganha linha própria, larga o bastante para não cortar o texto.
        const retencao = this.getDescricaoTpRetPisCofins(piscofins?.tpRetPisCofins);
        const cells: DanfseCell[] = [];
        if (this.str(piscofins?.CST)) {
            cells.push({ label: 'CST PIS/COFINS', value: this.str(piscofins?.CST), flex: 0.8 });
        }
        if (this.str(piscofins?.vBCPisCofins)) {
            cells.push({ label: 'Base PIS/COFINS', value: this.formatDecimal(piscofins?.vBCPisCofins), flex: 1, align: 'right' });
        }
        if (this.str(piscofins?.pAliqPis)) {
            cells.push({ label: 'Alíquota PIS (%)', value: this.formatDecimal(piscofins?.pAliqPis, 2, 4), flex: 0.9, align: 'right' });
        }
        if (this.str(piscofins?.pAliqCofins)) {
            cells.push({ label: 'Alíquota COFINS (%)', value: this.formatDecimal(piscofins?.pAliqCofins, 2, 4), flex: 0.9, align: 'right' });
        }
        if (retencao) {
            cells.push({ label: 'Retenção PIS/COFINS/CSLL', value: retencao, flex: 3, fontSize: 7, grow: true });
        }
        if (cells.length > 0) this.drawRow(cells);
    }

    _buildTotais() {
        const valores = this.infDPS.valores;
        const valoresNota = this.infNFSe.valores;

        const vServ = this.parseDecimal(valores?.vServPrest?.vServ);
        const vDescontos = this.parseDecimal(valores?.vDescCondIncond?.vDescIncond)
            + this.parseDecimal(valores?.vDescCondIncond?.vDescCond)
            + this.getDeducao().valor;

        this.sectionTitle('VALORES DA NFS-e');

        this.drawRow([
            { label: 'Valor total dos serviços', value: `R$ ${this.formatDecimal(vServ)}`, align: 'right', bold: true, fontSize: 9 },
            { label: 'Descontos e deduções', value: `R$ ${this.formatDecimal(vDescontos)}`, align: 'right' },
            { label: 'Total de retenções', value: `R$ ${this.formatDecimal(valoresNota?.vTotalRet)}`, align: 'right' },
            {
                label: 'Valor líquido da NFS-e',
                value: `R$ ${this.formatDecimal(valoresNota?.vLiq)}`,
                align: 'right',
                bold: true,
                fontSize: 9,
                fill: '#DDDDDD',
            },
        ], 26);
    }

    _buildInformacoesComplementares() {
        const infoCompl = this.infDPS.serv?.infoCompl;
        const totTrib = this.infDPS.valores?.trib?.totTrib;
        const subst = this.infDPS.subst;

        const linhas: string[] = [];

        const xInfComp = this.str(infoCompl?.xInfComp);
        if (xInfComp) linhas.push(xInfComp);

        const idDocTec = this.str(infoCompl?.idDocTec);
        if (idDocTec) linhas.push(`Identificação do documento técnico: ${idDocTec}`);

        const docRef = this.str(infoCompl?.docRef);
        if (docRef) linhas.push(`Documento de referência: ${docRef}`);

        if (subst?.chSubstda) {
            const motivo = [this.str(subst.cMotivo), this.str(subst.xMotivo)].filter(Boolean).join(' - ');
            linhas.push(`NFS-e substituída: ${this.str(subst.chSubstda)}${motivo ? ` (motivo: ${motivo})` : ''}`);
        }

        if (totTrib?.vTotTrib) {
            const { vTotTribFed, vTotTribEst, vTotTribMun } = totTrib.vTotTrib;
            linhas.push(
                'Valor aproximado dos tributos (Lei Federal 12.741/2012): '
                + `Federal R$ ${this.formatDecimal(vTotTribFed)} | `
                + `Estadual R$ ${this.formatDecimal(vTotTribEst)} | `
                + `Municipal R$ ${this.formatDecimal(vTotTribMun)}`,
            );
        } else if (totTrib?.pTotTrib) {
            const { pTotTribFed, pTotTribEst, pTotTribMun } = totTrib.pTotTrib;
            linhas.push(
                'Percentual aproximado dos tributos (Lei Federal 12.741/2012): '
                + `Federal ${this.formatDecimal(pTotTribFed)}% | `
                + `Estadual ${this.formatDecimal(pTotTribEst)}% | `
                + `Municipal ${this.formatDecimal(pTotTribMun)}%`,
            );
        }

        const cStat = this.str(this.infNFSe.cStat);
        if (cStat) linhas.push(`Status da NFS-e: ${cStat}`);

        if (this.str(this.infDPS.tpAmb) === '2') {
            linhas.push('NFS-e EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL.');
        }

        this.sectionTitle('INFORMAÇÕES COMPLEMENTARES');
        this.drawRow([{ label: 'Informações complementares', value: linhas.join('\n'), grow: true }], 60);
    }

    /** Rodapé e marca d'água aplicados em todas as páginas geradas. */
    _buildRodape() {
        const range = this.doc.bufferedPageRange();
        const homologacao = this.str(this.infDPS.tpAmb) === '2';

        for (let index = range.start; index < range.start + range.count; index++) {
            this.doc.switchToPage(index);

            const footerY = this.doc.page.height - 22;

            if (homologacao) {
                this.doc.save();
                this.doc.rotate(-30, { origin: [this.doc.page.width / 2, this.doc.page.height / 2] });
                this.doc.fillColor('#c7c7c7').font('Times-Bold').fontSize(30).text(
                    'SEM VALOR FISCAL',
                    0, this.doc.page.height / 2 - 20,
                    { width: this.doc.page.width, align: 'center', lineBreak: false },
                );
                this.doc.restore();
            }

            this.setLineStyle();
            this.doc.fillColor('#555555').font('Times-Roman').fontSize(5.5).text(
                `DANFSe gerada em ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`
                + (this.exibirMarcaDaguaDanfe ? ' por NFeWizard-io' : '')
                + ` - Consulte a autenticidade em ${this.urlConsulta}`,
                this.left, footerY,
                { width: this.usableWidth, align: 'left', lineBreak: false },
            );
            this.doc.text(`Página ${index - range.start + 1} de ${range.count}`, this.left, footerY, {
                width: this.usableWidth,
                align: 'right',
                lineBreak: false,
            });
            this.doc.fillColor('black');
        }
    }

    /**
     * Monta o PDF da DANFSe e grava em `outputPath`.
     */
    async generatePDF(exibirMarcaDaguaDanfe?: boolean): Promise<{ success: boolean; message: string }> {
        try {
            if (exibirMarcaDaguaDanfe !== undefined) {
                this.exibirMarcaDaguaDanfe = exibirMarcaDaguaDanfe;
            }

            await this.generateQRCode(`${this.urlConsulta}/?tpc=1&chave=${this.chave}`);

            const outputDir = path.dirname(this.outputPath);
            if (outputDir && !fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const stream = fs.createWriteStream(this.outputPath);
            this.doc.pipe(stream);

            this._buildCabecalho();
            this._buildIdentificacao();
            this._buildPrestador();
            this._buildTomador();
            this._buildIntermediario();
            this._buildServico();
            this._buildTributacaoMunicipal();
            this._buildTributacaoFederal();
            this._buildTotais();
            this._buildInformacoesComplementares();
            this._buildRodape();

            this.doc.end();

            await new Promise<void>((resolve, reject) => {
                stream.on('finish', () => resolve());
                stream.on('error', reject);
            });

            return {
                success: true,
                message: `DANFSe gerada em '${this.outputPath}'`,
            };
        } catch (error: any) {
            throw new Error(`Erro ao gerar DANFSe: ${error.message}`);
        }
    }
}

/**
 * Normaliza a entrada aceita pelo gerador: XML puro, XML em Base64 ou o
 * conteúdo GZip + Base64 devolvido pelo Ambiente de Dados Nacional
 * (campo `nfseXmlGZipB64` da autorização/consulta).
 */
function normalizeXmlInput(data: string): string {
    const conteudo = String(data ?? '').trim();

    if (!conteudo) {
        throw new Error('XML da NFSe não informado.');
    }

    if (conteudo.startsWith('<')) {
        return conteudo;
    }

    const buffer = Buffer.from(conteudo, 'base64');

    // Assinatura GZip (0x1f 0x8b)
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        return gunzipSync(buffer).toString('utf-8');
    }

    const decodificado = buffer.toString('utf-8').trim();
    if (decodificado.startsWith('<')) {
        return decodificado;
    }

    throw new Error('Não foi possível interpretar o conteúdo informado como XML de NFSe.');
}

/**
 * Gera a DANFSe em PDF a partir do XML da NFSe, sem depender do webservice do
 * município — mesmo fluxo do `NFEGerarDanfe` para a NFe.
 *
 * @example
 * ```typescript
 * import { NFSeGerarDanfeFromXml } from '@nfewizard/danfe';
 *
 * const resultado = await NFSeGerarDanfeFromXml({
 *   data: xmlDaNFSe,            // XML, Base64 ou GZip+Base64 (nfseXmlGZipB64)
 *   outputPath: 'tmp/danfse.pdf'
 * });
 * ```
 */
export async function NFSeGerarDanfeFromXml(params: NFSeGerarDanfeFromXmlProps): Promise<{
    success: boolean;
    message: string;
}> {
    const { data, outputPath, chave: chaveOverride, exibirMarcaDaguaDanfe, urlConsulta } = params;

    try {
        const xml = normalizeXmlInput(data);
        const { data: nfse, chave } = new XmlParser().convertXmlNFSeToJson(xml);

        logger.info('Iniciando geração de DANFSe a partir do XML', {
            context: 'NFSeGerarDanfe',
            chaveAcesso: chaveOverride || chave,
        });

        const danfse = new NFSeDanfeGenerator({
            data: nfse as unknown as NFSeDocumento,
            chave: chaveOverride || chave,
            outputPath,
            exibirMarcaDaguaDanfe,
            urlConsulta,
        });

        const resultado = await danfse.generatePDF();

        logger.info('DANFSe gerada com sucesso', {
            context: 'NFSeGerarDanfe',
            outputPath,
        });

        return resultado;
    } catch (error: any) {
        logger.error('Erro ao gerar DANFSe', error, {
            context: 'NFSeGerarDanfe',
        });
        // normalizeXmlInput/convertXmlNFSeToJson/generatePDF já lançam erros
        // com mensagem descritiva (generatePDF já prefixa com "Erro ao gerar
        // DANFSe: "); repropagamos sem embrulhar de novo para não duplicar o prefixo.
        throw error;
    }
}

/**
 * Gera DANFSe (Documento Auxiliar da Nota Fiscal de Serviços Eletrônica) em PDF.
 *
 * O PDF é montado localmente a partir do XML da NFSe, sem depender de uma API
 * externa de download.
 *
 * @example
 * ```typescript
 * import { NFSeGerarDanfe } from '@nfewizard/danfe';
 *
 * await NFSeGerarDanfe({
 *   data: xmlDaNFSe,
 *   outputPath: 'tmp/danfse.pdf'
 * });
 * ```
 */
export async function NFSeGerarDanfe(params: NFSeGerarDanfeProps): Promise<{
    success: boolean;
    message: string;
}> {
    return await NFSeGerarDanfeFromXml(params);
}

export { NFSeDanfeGenerator };
