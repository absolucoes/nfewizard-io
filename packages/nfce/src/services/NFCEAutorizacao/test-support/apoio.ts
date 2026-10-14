/*
 * Apoio dos testes do QR Code e dos ouros da autorização: serviço com XmlBuilder de verdade, par de chaves
 * gerado na hora (nenhum certificado real) e uma NFC-e mínima.
 */
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { XmlBuilder } from '@nfewizard/shared';

const NFCEAutorizacaoService = require('../NFCEAutorizacaoService').NFCEAutorizacaoService;

export const URL_QR = 'https://qr.exemplo.invalid/nfce/qrcode';
export const URL_CONSULTA = 'https://consulta.exemplo.invalid/nfce';
export const CHAVE = '52261011222333000181658800000000011123456788';
export const CSC_FICTICIO = 'CSC-FICTICIO-DO-TESTE-0001';

export const utilityFalso: any = {
    getUrlNFCe: (metodo: string) => (metodo === 'URL-QRCode' ? URL_QR : URL_CONSULTA),
    gerarHashCSRT: () => 'hash',
};

export const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export function montarServico(nfe: Record<string, unknown>) {
    const environment: any = {
        getConfig: () => ({
            dfe: { ambiente: 2, UF: 'GO', baixarXMLDistribuicao: false },
            nfe: { ambiente: 2, versaoDF: '4.00', ...nfe },
            lib: {},
        }),
        getCert: () => publicKey,
        getCertKey: () => privateKey,
    };
    return new NFCEAutorizacaoService(environment, utilityFalso, new XmlBuilder(environment), {}, {}, {});
}

export function montarNFe(sobre: { tpEmis?: number | string; dhEmi?: string; dest?: Record<string, unknown> | null } = {}) {
    const tpEmis = sobre.tpEmis ?? 1;
    const contingencia = [4, 9].includes(Number(tpEmis));
    return {
        idLote: 1,
        indSinc: 1,
        NFe: {
            infNFe: {
                ide: {
                    cUF: 52,
                    cNF: '12345678',
                    natOp: 'VENDA',
                    mod: 65,
                    serie: 880,
                    nNF: 1,
                    dhEmi: sobre.dhEmi ?? '2026-10-13T10:00:00-03:00',
                    tpNF: 1,
                    idDest: 1,
                    cMunFG: '5208707',
                    tpImp: 4,
                    tpEmis,
                    tpAmb: 2,
                    finNFe: 1,
                    indFinal: 1,
                    indPres: 1,
                    procEmi: 0,
                    verProc: '1.0.0.0',
                    ...(contingencia ? { dhCont: '2026-10-13T09:30:00-03:00', xJust: 'Falha de comunicacao com a SEFAZ' } : {}),
                },
                emit: {
                    CNPJCPF: '11222333000181',
                    xNome: 'EMITENTE FICTICIO LTDA',
                    enderEmit: { xLgr: 'RUA UM', nro: '1', xBairro: 'CENTRO', cMun: '5208707', xMun: 'GOIANIA', UF: 'GO', CEP: '74000000' },
                    IE: '102959438',
                    CRT: 3,
                },
                ...(sobre.dest === null ? {} : { dest: sobre.dest ?? { CPF: '11144477735', xNome: 'CONSUMIDOR', indIEDest: 9 } }),
                det: {
                    prod: { cProd: '1', cEAN: 'SEM GTIN', xProd: 'PRODUTO DE TESTE', NCM: '23099090', CFOP: '5102', uCom: 'UN', qCom: '1.0000', vUnCom: '10.00', vProd: '10.00', cEANTrib: 'SEM GTIN', uTrib: 'UN', qTrib: '1.0000', vUnTrib: '10.00', indTot: 1 },
                    imposto: {},
                },
                total: { ICMSTot: { vBC: '0.00', vICMS: '0.00', vICMSDeson: '0.00', vFCP: '0.00', vBCST: '0.00', vST: '0.00', vFCPST: '0.00', vFCPSTRet: '0.00', vProd: '10.00', vFrete: '0.00', vSeg: '0.00', vDesc: '0.00', vII: '0.00', vIPI: '0.00', vIPIDevol: '0.00', vPIS: '0.00', vCOFINS: '0.00', vOutro: '0.00', vNF: '10.00' } },
                transp: { modFrete: 9 },
                pag: { detPag: { tPag: '01', vPag: '10.00' } },
            },
        },
    };
}

/** O que o certificado muda a cada execução fica fora da comparação com o ouro. */
export function semAssinatura(xml: string): string {
    return xml
        .replace(/<SignatureValue>[^<]*<\/SignatureValue>/, '<SignatureValue/>')
        .replace(/<KeyInfo>[\s\S]*?<\/KeyInfo>/, '<KeyInfo/>');
}

export function qrCodeDoXml(xml: string): string {
    const m = xml.match(/<qrCode>([^<]*)<\/qrCode>/);
    if (!m) throw new Error('qrCode ausente no XML');
    return m[1].replace(/&amp;/g, '&');
}

/** Compara com o ouro; UPDATE_OURO=1 regrava (só para gerar o ouro de propósito). */
export function conferirOuro(nome: string, xml: string) {
    const arquivo = path.join(__dirname, '..', '__tests__', 'ouro', nome);
    const atual = semAssinatura(xml);
    if (process.env.UPDATE_OURO === '1') {
        fs.mkdirSync(path.dirname(arquivo), { recursive: true });
        fs.writeFileSync(arquivo, atual);
    }
    expect(atual).toBe(fs.readFileSync(arquivo, 'utf8'));
}
