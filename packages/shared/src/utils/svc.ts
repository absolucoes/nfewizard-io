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

/**
 * SEFAZ Virtual de Contingência da NF-e (modelo 55).
 *
 * A nota emitida em contingência SVC leva tpEmis 6 (SVC-AN) ou 7 (SVC-RS), e esse dígito fica na posição 35 da chave.
 * Autorização, consulta de protocolo e eventos regionais dessa nota vão ao webservice da SVC, não ao da UF.
 * O valor devolvido é o `mod` que `Utility.getWebServiceUrl` entende ('NFeSVC-AN' ou 'NFeSVC-RS').
 */
export type ModeloSvc = 'NFeSVC-AN' | 'NFeSVC-RS';

/** Autorizadora que o chamador pode pedir explicitamente (status do serviço). */
export type AutorizadoraNFe = 'SVC-AN' | 'SVC-RS' | 'SVRS';

export function ehModeloSvc(mod: string | undefined): mod is ModeloSvc {
    return mod === 'NFeSVC-AN' || mod === 'NFeSVC-RS';
}

/** tpEmis 6 → SVC-AN, 7 → SVC-RS; qualquer outro → undefined (segue a autorizadora normal). */
export function modeloSvcPorTpEmis(tpEmis: string | number | undefined | null): ModeloSvc | undefined {
    const t = String(tpEmis ?? '').trim();
    if (t === '6') return 'NFeSVC-AN';
    if (t === '7') return 'NFeSVC-RS';
    return undefined;
}

/** Lê o tpEmis da posição 35 da chave de acesso (44 posições). */
export function modeloSvcPorChave(chave: string | undefined | null): ModeloSvc | undefined {
    if (typeof chave !== 'string' || chave.length !== 44) return undefined;
    return modeloSvcPorTpEmis(chave.charAt(34));
}

/** 'SVC-AN' → 'NFeSVC-AN', 'SVC-RS' → 'NFeSVC-RS', 'SVRS' → 'NFeSVRS'. Valor desconhecido lança erro. */
export function modeloPorAutorizadora(autorizadora: string): string {
    switch (autorizadora) {
        case 'SVC-AN': return 'NFeSVC-AN';
        case 'SVC-RS': return 'NFeSVC-RS';
        case 'SVRS': return 'NFeSVRS';
        default:
            throw new Error(`Autorizadora desconhecida: "${autorizadora}". Use SVC-AN, SVC-RS ou SVRS.`);
    }
}
