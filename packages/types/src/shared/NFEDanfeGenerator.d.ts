import { LayoutNFe, ProtNFe } from '../nfe/NFEAutorizacao.js';
export type NFEGerarDanfeProps = {
    /**
     * @param {NFe} data - Dados da NFe
     */
    data: {
        /**
         * @param {LayoutNFe  | LayoutNFe[]} NFe - Dados da NFe
         */
        NFe: LayoutNFe | LayoutNFe[];
        /**
         * @param {ProtNFe} protNFe - Dados da aturoziação de uso da NFe
         */
        protNFe?: ProtNFe;
        /**
         * @param {ProtNFe} protNFe - Força remoção da mensagem de "NFe não transmitida"
         */
        forceTransmitida?: boolean;
    };
    /**
     * @param {string} chave - Chave da NFe
     */
    chave: string;
    /**
     * @param {string} outputPath - Local onde a DANFE será gravada
     */
    outputPath: string;
    /**
     * @param {number} pageWidth - Largura da Página
     */
    pageWidth?: number;
    /** Logo do emitente (PNG/JPEG), opcional. */
    logo?: Buffer;
    /** Texto da faixa de homologação, opcional. */
    faixaAmbiente?: string;
    /** NFC-e: imprime a "Via do Estabelecimento". */
    viaEstabelecimento?: boolean;
    /** NFC-e: marca o DANFCE como "NFC-e CANCELADA". */
    cancelada?: boolean;
};
//# sourceMappingURL=NFEDanfeGenerator.d.ts.map