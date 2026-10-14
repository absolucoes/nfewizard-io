/*
 * This file is part of NFeWizard-io.
 * 
 * NFeWizard-io is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * NFeWizard-io is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with NFeWizard-io. If not, see <https://www.gnu.org/licenses/>.
 */

import { Utility } from '@nfewizard/shared';
import { createHash, createSign } from 'crypto';
import sha1 from 'sha1';

/**
 * Tipo do identificador do destinatário no QR Code v3 off-line:
 * 1 = CNPJ, 2 = CPF, 3 = idEstrangeiro. Sem destinatário, os dois campos
 * (tp_idDest e idDest) seguem vazios, mantendo os pipes.
 */
export type TipoIdDestinatarioQRCode = 1 | 2 | 3 | '';

// Função para gerar o hash SHA-1 em formato hexadecimal
function generateSHA1Hash(input: string): string {
    return createHash('sha1').update(input).digest('hex');
}

function calcularDigestValueHex(digVal: string): string {
    return Buffer.from(digVal).toString('hex');
}

// Função para gerar a URL do QR Code para emissão ONLINE
export function generateQRCodeURLOnline(
    chaveAcesso: string,
    versaoQRCode: string,
    tipoAmbiente: number,
    identificadorCSC: number,
    csc: string,
    utility: Utility
): string {
    const urlQRCodeNFCe = utility.getUrlNFCe('URL-QRCode', false, '');
    chaveAcesso = chaveAcesso.replace('NFe', '');

    // Passo 1: Concatenar parâmetros
    const baseString = `${chaveAcesso}|${versaoQRCode}|${tipoAmbiente}|${identificadorCSC}`;

    // Passo 2: Adicionar o CSC
    const stringToHash = `${baseString}${csc}`;

    // Passo 3: Gerar o hash
    const codigoHash = generateSHA1Hash(stringToHash);

    // Montar a URL final
    return `${urlQRCodeNFCe}?p=${baseString}|${codigoHash}`;
}

// Função para gerar a URL do QR Code para emissão OFFLINE
export function generateQRCodeURLOffline(
    chaveAcesso: string,
    versaoQRCode: string,
    tipoAmbiente: number,
    diaDataEmissao: string,
    valorTotalNfce: string,
    digVal: string,
    identificadorCSC: number,
    csc: string,
    utility: Utility
): string {
    const urlQRCodeNFCe = utility.getUrlNFCe('URL-QRCode', false, '');
    chaveAcesso = chaveAcesso.replace('NFe', '');

    // Passo 1: Converter DigestValue para HEXA
    const digestValueHex = calcularDigestValueHex(digVal)

    // Passo 2: Concatenar parâmetros
    const baseString = `${chaveAcesso}|${versaoQRCode}|${tipoAmbiente}|${diaDataEmissao}|${valorTotalNfce}|${digestValueHex}|${identificadorCSC}`;

    // Passo 3: Adicionar o CSC
    const stringToHash = `${baseString}${csc}`;

    // Passo 4: Gerar o hash
    const hash = sha1(stringToHash).toUpperCase();

    // Montar URL
    return `${urlQRCodeNFCe}?p=${baseString}|${hash}`;
}

/**
 * QR Code versão 3 (NT 2025.001) para emissão ONLINE:
 * `<urlQRCode>?p=<chave>|3|<tpAmb>`. Não usa idCSC nem CSC.
 */
export function generateQRCodeURLOnlineV3(
    chaveAcesso: string,
    tipoAmbiente: number,
    utility: Utility
): string {
    const urlQRCodeNFCe = utility.getUrlNFCe('URL-QRCode', false, '');
    chaveAcesso = chaveAcesso.replace('NFe', '');
    return `${urlQRCodeNFCe}?p=${chaveAcesso}|3|${tipoAmbiente}`;
}

/**
 * Texto assinado do QR Code v3 off-line (sem a assinatura):
 * `chave|3|tpAmb|dia|vNF|tp_idDest|idDest`.
 */
export function montarTextoQRCodeOfflineV3(
    chaveAcesso: string,
    tipoAmbiente: number,
    diaDataEmissao: string,
    valorTotalNfce: string,
    tipoIdDestinatario: TipoIdDestinatarioQRCode,
    idDestinatario: string
): string {
    return [
        chaveAcesso.replace('NFe', ''),
        '3',
        String(tipoAmbiente),
        diaDataEmissao,
        valorTotalNfce,
        String(tipoIdDestinatario),
        idDestinatario,
    ].join('|');
}

/**
 * QR Code versão 3 para emissão OFFLINE (contingência):
 * `<urlQRCode>?p=<texto>|<assinatura RSA-SHA1 em base64>`, assinando o texto
 * com a chave privada do certificado do emitente. Não usa idCSC nem CSC.
 */
export function generateQRCodeURLOfflineV3(
    chaveAcesso: string,
    tipoAmbiente: number,
    diaDataEmissao: string,
    valorTotalNfce: string,
    tipoIdDestinatario: TipoIdDestinatarioQRCode,
    idDestinatario: string,
    chavePrivadaPem: string,
    utility: Utility
): string {
    const urlQRCodeNFCe = utility.getUrlNFCe('URL-QRCode', false, '');
    const texto = montarTextoQRCodeOfflineV3(
        chaveAcesso,
        tipoAmbiente,
        diaDataEmissao,
        valorTotalNfce,
        tipoIdDestinatario,
        idDestinatario
    );
    const assinatura = createSign('RSA-SHA1').update(texto).sign(chavePrivadaPem, 'base64');
    return `${urlQRCodeNFCe}?p=${texto}|${assinatura}`;
}
