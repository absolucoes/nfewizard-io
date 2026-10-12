import { existsSync } from 'node:fs';
import path from 'node:path';
import libxmljs from 'libxmljs2';
import xsdAssembler from 'xsd-assembler';

const assembler = (xsdAssembler as any).default ?? (xsdAssembler as any);

const diretorios = [
  path.resolve(process.cwd(), 'resources/schemas'),
  path.resolve(process.cwd(), 'packages/mdfe/resources/schemas'),
  path.resolve(process.cwd(), 'node_modules/@nfewizard/mdfe/resources/schemas')
];

export async function validarXmlMdfe(xml: string, nomeSchema = 'mdfe_v3.00.xsd'): Promise<void> {
  const base = diretorios.find((dir) => existsSync(path.join(dir, nomeSchema)));
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
