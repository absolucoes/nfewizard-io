import { existsSync } from 'node:fs';
import path from 'node:path';
import libxmljs from 'libxmljs2';
import xsdAssembler from 'xsd-assembler';
import { diretorioDoModulo } from './MDFeSchemaDir.js';

const assembler = (xsdAssembler as any).default ?? (xsdAssembler as any);

/**
 * Onde ficam os XSD (`resources/schemas`), contados a partir do arquivo em execução e nunca do diretório de
 * trabalho: quem instala o pacote roda de qualquer cwd, e o caminho por cwd só achava os XSD no checkout do fork.
 */
export function diretoriosSchemaMdfe(base: string = diretorioDoModulo): string[] {
  return [
    path.resolve(base, '../../resources/schemas'), // código-fonte: src/util
    path.resolve(base, '../../../resources/schemas') // pacote construído: dist/src/util
  ];
}

export async function validarXmlMdfe(xml: string, nomeSchema = 'mdfe_v3.00.xsd'): Promise<void> {
  const base = diretoriosSchemaMdfe().find((dir) => existsSync(path.join(dir, nomeSchema)));
  if (!base) throw new Error('MDFE_SCHEMA_NAO_ENCONTRADO: ' + nomeSchema);
  try {
    const schemaCompleto = await assembler.assemble(path.join(base, nomeSchema));
    const xmlDoc = libxmljs.parseXml(xml);
    const xsdDoc = libxmljs.parseXml(schemaCompleto, { baseUrl: base + '/' });
    if (!xmlDoc.validate(xsdDoc)) {
      const erros = (xmlDoc.validationErrors || []).map((erro: any) => String(erro.message ?? erro).trim());
      throw new Error('MDFE_SCHEMA_INVALIDO: ' + (erros.join('; ') || 'XML inválido no XSD do MDF-e'));
    }
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith('MDFE_SCHEMA_')) throw erro;
    throw new Error('MDFE_SCHEMA_VALIDACAO_FALHOU: ' + (erro instanceof Error ? erro.message : String(erro)));
  }
}
