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

import { existsSync } from 'node:fs';
import path from 'node:path';
import libxmljs from 'libxmljs2';
import xsdAssembler from 'xsd-assembler';
import { diretorioDoModulo } from './CTeSchemaDir.js';

/**
 * Onde ficam os XSD (`resources/schemas`), contados a partir do arquivo em execução e nunca do diretório
 * de trabalho do processo: o pacote publicado roda de `dist/`, o código-fonte de `src/services/util/`.
 * Quem instala o pacote como dependência executa de qualquer cwd, e o caminho por cwd só achava os XSD
 * no checkout do próprio fork.
 */
export function diretoriosSchema(base: string = diretorioDoModulo): string[] {
    return [
        path.resolve(base, '../resources/schemas'),
        path.resolve(base, '../../../resources/schemas'),
    ];
}

/** XSD de cada documento transmitido em `CTeRecepcaoSincV4`, por tag raiz do XML. */
export const SCHEMA_POR_RAIZ: Record<string, string> = {
    CTe: 'cte_v4.00.xsd',
    CTeOS: 'cteOS_v4.00.xsd',
    GTVe: 'GTVe_v4.00.xsd',
    CTeSimp: 'cteSimp_v4.00.xsd',
};

export async function validarXmlCte(xml: string, nomeSchema = 'cte_v4.00.xsd'): Promise<void> {
    const basePath = diretoriosSchema().find((diretorio) => existsSync(path.join(diretorio, nomeSchema)));
    if (!basePath) throw new Error('CTE_SCHEMA_NAO_ENCONTRADO: ' + nomeSchema);

    try {
        const schemaPath = path.join(basePath, nomeSchema);
        const schemaCompleto = await xsdAssembler.assemble(schemaPath);
        const xmlDoc = libxmljs.parseXml(xml);
        const xsdDoc = libxmljs.parseXml(schemaCompleto, { baseUrl: basePath + '/' });
        if (!xmlDoc.validate(xsdDoc)) {
            const erros = (xmlDoc.validationErrors || []).map((erro: any) => String(erro.message ?? erro).trim());
            throw new Error('CTE_SCHEMA_INVALIDO: ' + (erros.join('; ') || 'XML inválido no XSD do CT-e'));
        }
    } catch (erro) {
        if (erro instanceof Error && erro.message.startsWith('CTE_SCHEMA_')) throw erro;
        throw new Error('CTE_SCHEMA_VALIDACAO_FALHOU: ' + (erro instanceof Error ? erro.message : String(erro)));
    }
}
