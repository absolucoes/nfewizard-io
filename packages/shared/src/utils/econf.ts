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
 * Conciliação Financeira (ECONF, 110750) e seu cancelamento (110751), NT 2024.002.
 *
 * O envEvento genérico não olha dentro do detEvento (`xs:any` com `skip`), então um `detPag` fora de ordem ou um
 * `tPag` malformado só seria recusado pela SEFAZ. Cada um dos dois eventos tem o seu pacote de XSD (pasta
 * `resources/schemas/econf`), e o lote é validado contra ele antes de sair.
 */

export const TP_EVENTO_ECONF = '110750';
export const TP_EVENTO_ECONF_CANCELAMENTO = '110751';

/** Órgão de recepção do ECONF da NF-e (modelo 55): a SVRS. A NFC-e (65) usa o código da UF autorizadora. */
export const ORGAO_ECONF_NFE = 92;

/** Máximo de eventos por lote (`envEvento`, `maxOccurs` 20). */
export const MAX_EVENTOS_POR_LOTE = 20;

const SCHEMA_POR_TP_EVENTO: Record<string, 'NFEEventoEConf' | 'NFEEventoCancEConf'> = {
    [TP_EVENTO_ECONF]: 'NFEEventoEConf',
    [TP_EVENTO_ECONF_CANCELAMENTO]: 'NFEEventoCancEConf',
};

/** `true` se o evento é o ECONF ou o seu cancelamento. */
export function ehEventoEconf(tpEvento: string | undefined | null): boolean {
    return !!tpEvento && tpEvento in SCHEMA_POR_TP_EVENTO;
}

/** `descEvento` do XML, que o XSD fixa por enumeração (o cancelamento leva acento). */
export function descEventoEconf(tpEvento: string): string | undefined {
    if (tpEvento === TP_EVENTO_ECONF) return 'ECONF';
    if (tpEvento === TP_EVENTO_ECONF_CANCELAMENTO) return 'Cancelamento Conciliação Financeira';
    return undefined;
}

/** Descrição do evento, usada no retorno do envio. */
export function nomeDoEventoEconf(tpEvento: string): string | undefined {
    if (tpEvento === TP_EVENTO_ECONF) return 'ECONF';
    if (tpEvento === TP_EVENTO_ECONF_CANCELAMENTO) return 'Cancelamento ECONF';
    return undefined;
}

/**
 * Chave do XSD que vale para o lote, ou `undefined` se o lote não tem ECONF.
 * Cada evento tem o seu `envEvento`, então o lote não mistura ECONF, cancelamento de ECONF e outros eventos.
 */
export function schemaDoLoteEconf(eventos: Array<{ tpEvento: string }>): 'NFEEventoEConf' | 'NFEEventoCancEConf' | undefined {
    const tipos = new Set(eventos.map(e => e.tpEvento));
    if (![...tipos].some(t => ehEventoEconf(t))) return undefined;
    if (tipos.size > 1) {
        throw new Error(
            `NFE_RecepcaoEvento: o lote mistura o ECONF (110750 e 110751) com outros eventos (${[...tipos].join(', ')}); ` +
            'cada evento tem o seu XSD, envie em lotes separados.',
        );
    }
    return SCHEMA_POR_TP_EVENTO[[...tipos][0]];
}

/** Recusa lote vazio ou com mais de 20 eventos, que a SEFAZ também recusaria. */
export function validarTamanhoDoLote(eventos: unknown[]): void {
    if (!Array.isArray(eventos) || eventos.length === 0) {
        throw new Error('NFE_RecepcaoEvento: informe ao menos um evento.');
    }
    if (eventos.length > MAX_EVENTOS_POR_LOTE) {
        throw new Error(`NFE_RecepcaoEvento: o lote tem ${eventos.length} eventos e o máximo é ${MAX_EVENTOS_POR_LOTE}.`);
    }
}
