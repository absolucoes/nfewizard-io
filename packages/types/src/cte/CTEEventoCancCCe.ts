export interface CTeInfCorrecao {
    grupoAlterado: string;
    campoAlterado: string;
    valorAlterado: string;
    nroItemAlterado?: string | number;
}

export interface CTeEventoBase {
    chCTe: string;
    cOrgao: number | string;
    CNPJ: string;
    nSeqEvento?: number;
    dhEvento?: string;
    tpAmb?: number | string;
}

export interface CTeCancelamento extends CTeEventoBase {
    nProt: string;
    xJust: string;
}

export interface CTeCartaCorrecao extends CTeEventoBase {
    infCorrecao: CTeInfCorrecao[];
}

export interface CTeEventoCancCCeResultado {
    success: boolean;
    eventos: Array<{
        chCTe?: string;
        tpEvento: '110110' | '110111';
        cStat?: string;
        xMotivo?: string;
        nProt?: string;
        dhRegEvento?: string;
    }>;
}
