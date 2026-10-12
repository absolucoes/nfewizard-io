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
 * Data/hora do evento no fuso de Brasília (-03:00), no formato que o XSD do CT-e aceita:
 * AAAA-MM-DDThh:mm:ss-03:00, sem milissegundos e sem "Z".
 *
 * `Date.toISOString()` devolve UTC com milissegundos e "Z" (o XSD recusa), e `date-fns/format` com
 * `xxx` usa o fuso do processo (em container UTC sai +00:00, que a SEFAZ rejeita como data futura/passada).
 */
export function agoraComOffsetBrasilia(agora: Date = new Date()): string {
    const emBrasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
    return `${emBrasilia.toISOString().slice(0, 19)}-03:00`;
}
