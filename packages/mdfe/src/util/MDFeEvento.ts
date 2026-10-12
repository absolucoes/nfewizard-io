import { Builder } from 'xml2js';

export type TipoEventoMdfe = '110111' | '110112' | '110114';

export interface DadosEventoMdfe {
  tpEvento: TipoEventoMdfe;
  cOrgao: string;
  tpAmb: 1 | 2;
  cnpj: string;
  chave: string;
  dhEvento: string;
  nSeqEvento?: number;
  nProt?: string;
  xJust?: string;
  dtEnc?: string;
  cUF?: string;
  cMun?: string;
  xNome?: string;
  cpf?: string;
}

const EVENTOS: Record<TipoEventoMdfe, { elemento: string; descricao: string }> = {
  '110111': { elemento: 'evCancMDFe', descricao: 'Cancelamento' },
  '110112': { elemento: 'evEncMDFe', descricao: 'Encerramento' },
  '110114': { elemento: 'evIncCondutorMDFe', descricao: 'Inclusao Condutor' }
};

export function montarXmlEventoMdfe(dados: DadosEventoMdfe): string {
  if (!/^[0-9A-Z]{44}$/.test(dados.chave)) throw new Error('MDFE_CHAVE_INVALIDA');
  if (!/^[0-9A-Z]{14}$/.test(dados.cnpj)) throw new Error('MDFE_CNPJ_INVALIDO');
  const tipo = EVENTOS[dados.tpEvento];
  const nSeqEvento = String(dados.nSeqEvento ?? 1).padStart(2, '0');
  const detalhe: Record<string, unknown> = { descEvento: tipo.descricao };
  if (dados.tpEvento === '110111') Object.assign(detalhe, { nProt: dados.nProt, xJust: dados.xJust });
  if (dados.tpEvento === '110112') Object.assign(detalhe, { nProt: dados.nProt, dtEnc: dados.dtEnc, cUF: dados.cUF, cMun: dados.cMun });
  if (dados.tpEvento === '110114') Object.assign(detalhe, { condutor: { xNome: dados.xNome, CPF: dados.cpf } });

  const evento = {
    $: { xmlns: 'http://www.portalfiscal.inf.br/mdfe', versao: '3.00' },
    infEvento: {
      $: { Id: 'ID' + dados.tpEvento + dados.chave + nSeqEvento },
      cOrgao: dados.cOrgao,
      tpAmb: dados.tpAmb,
      CNPJ: dados.cnpj,
      chMDFe: dados.chave,
      dhEvento: dados.dhEvento,
      tpEvento: dados.tpEvento,
      nSeqEvento,
      detEvento: { $: { versaoEvento: '3.00' }, [tipo.elemento]: detalhe }
    }
  };
  return new Builder({ headless: true, renderOpts: { pretty: false } }).buildObject({ eventoMDFe: evento });
}
