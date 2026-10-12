import fs from 'fs';

import { textoDoPdf as pdfParse } from '../../test-support/pdfTexto';
import { MDFE_GerarDamdfe } from './MDFEGerarDamdfe.js';

const CHAVE = '35261012345678000195580010000000011123456780';
const XML = '<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">' +
'<MDFe><infMDFe Id="MDFe' + CHAVE + '" versao="3.00">' +
'<ide><mod>58</mod><serie>1</serie><nMDF>1</nMDF><dhEmi>2026-10-09T12:00:00-03:00</dhEmi><UFIni>GO</UFIni><UFFim>SP</UFFim></ide>' +
'<emit><CNPJ>12345678000195</CNPJ><IE>123456789</IE><xNome>Transportadora Fictícia de Teste</xNome><RNTRC>12345678</RNTRC><enderEmit><xLgr>Rua de Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><xMun>Goiânia</xMun><UF>GO</UF><CEP>74000000</CEP></enderEmit></emit>' +
'<infModal versaoModal="3.00"><rodo><veicTracao><placa>ABC1D23</placa><UF>GO</UF><RNTRC>12345678</RNTRC><condutor><xNome>Motorista Fictício</xNome><CPF>12345678909</CPF></condutor></veicTracao></rodo></infModal>' +
'<infDoc><infMunDescarga><cMunDescarga>3550308</cMunDescarga><xMunDescarga>São Paulo</xMunDescarga><infNFe><chNFe>35261012345678000195550010000000011000000001</chNFe></infNFe></infMunDescarga></infDoc>' +
'<prodPred><tpCarga>05</tpCarga><xProd>Mercadoria de teste</xProd></prodPred><seg><xSeg>Seguradora Fictícia</xSeg><nApol>123</nApol></seg>' +
'<tot><qNFe>1</qNFe><vCarga>100.00</vCarga><cUnid>01</cUnid><qCarga>10.0000</qCarga></tot>' +
'</infMDFe><infMDFeSupl><qrCodMDFe>https://dfe-portal.svrs.rs.gov.br/mdfe/qrCode?chMDFe=' + CHAVE + '&amp;tpAmb=2</qrCodMDFe></infMDFeSupl></MDFe>' +
'<protMDFe><infProt><tpAmb>2</tpAmb><cStat>100</cStat><xMotivo>Autorizado o uso do MDF-e</xMotivo><chMDFe>' + CHAVE + '</chMDFe>' +
'<dhRecbto>2026-10-09T12:01:00-03:00</dhRecbto><nProt>135260000000001</nProt></infProt></protMDFe></mdfeProc>';

describe('MDFE_GerarDamdfe', () => {
  it('gera PDF legível com a chave, protocolo e aviso de homologação', async () => {
    const outputPath = process.env.DAMDFE_TEST_OUTPUT || '/tmp/mdfe-damdfe-teste.pdf';
    const result = await MDFE_GerarDamdfe({ data: XML, outputPath });
    const parsed = pdfParse(await fs.promises.readFile(outputPath));
    expect(result.totalPaginas).toBe(1);
    expect(parsed.text.replaceAll(' ', '')).toContain(CHAVE);
    expect(parsed.text).toContain('135260000000001');
    expect(parsed.text).toContain('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO');
    expect(parsed.text).toContain('Motorista Fictício');
    expect(parsed.text).toContain('100,00');
  });

  it('não imprime a marca de homologação para ambiente de produção', async () => {
    const producao = XML.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>');
    const outputPath = '/tmp/mdfe-damdfe-producao.pdf';
    await MDFE_GerarDamdfe({ data: producao, outputPath });
    const parsed = pdfParse(await fs.promises.readFile(outputPath));
    expect(parsed.text).not.toContain('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO');
    expect(parsed.text).toContain('Protocolo de autorização');
  });

  it('continua a lista de documentos em páginas adicionais', async () => {
    const grupo = '<infNFe><chNFe>35261012345678000195550010000000011000000001</chNFe></infNFe>';
    const muitos = XML.replace(grupo, Array(19).fill(grupo).join(''));
    const outputPath = '/tmp/mdfe-damdfe-varias-paginas.pdf';
    const result = await MDFE_GerarDamdfe({ data: muitos, outputPath });
    const parsed = pdfParse(await fs.promises.readFile(outputPath));
    expect(result.totalPaginas).toBe(2);
    expect(parsed.numpages).toBe(2);
    expect(parsed.text).toContain('2/2');
  });

  it('recusa XML sem protocolo de autorização', async () => {
    const semProtocolo = XML.replace(/<protMDFe>[\s\S]*<\/protMDFe>/, '');
    await expect(MDFE_GerarDamdfe({ data: semProtocolo, outputPath: '/tmp/mdfe-sem-protocolo.pdf' }))
      .rejects.toThrow('DAMDFE_EXIGE_MDFE_AUTORIZADO');
  });
});

// MDF-e no formato do XSD 3.00: o RNTRC mora em `rodo/infANTT/RNTRC` (não em `emit` nem em `veicTracao`), e o veículo
// leva RENAVAM e tara. Dados fictícios.
const ANTT = '<infANTT><RNTRC>87654321</RNTRC><valePed><disp><CNPJForn>11222333000181</CNPJForn><CNPJPg>12345678000195</CNPJPg><nCompra>COMP-777</nCompra><vValePed>150.50</vValePed></disp></valePed></infANTT>';
const TRACAO_XSD = '<veicTracao><placa>ABC1D23</placa><RENAVAM>01234567890</RENAVAM><tara>8000</tara><capKG>30000</capKG><condutor><xNome>Motorista Fictício</xNome><CPF>12345678909</CPF></condutor><tpRod>03</tpRod><tpCar>02</tpCar><UF>GO</UF></veicTracao>';
const REBOQUE_XSD = '<veicReboque><placa>REB1A11</placa><RENAVAM>09876543210</RENAVAM><tara>6000</tara><capKG>25000</capKG><tpCar>02</tpCar><UF>GO</UF></veicReboque>';
const MODAL_XSD = '<infModal versaoModal="3.00"><rodo>' + ANTT + TRACAO_XSD + REBOQUE_XSD + '<lacRodo><nLacre>LAC-001</nLacre></lacRodo><lacRodo><nLacre>LAC-002</nLacre></lacRodo></rodo></infModal>';
const XML_XSD = XML
    .replace('<RNTRC>12345678</RNTRC><enderEmit>', '<enderEmit>')
    .replace(/<infModal[\s\S]*<\/infModal>/, MODAL_XSD);

describe('MDFE_GerarDamdfe: campos do leiaute 3.00 (RNTRC em infANTT, Anexo II do MOC)', () => {
  async function texto(xml: string, nome: string) {
    const outputPath = '/tmp/mdfe-damdfe-' + nome + '.pdf';
    const result = await MDFE_GerarDamdfe({ data: xml, outputPath });
    const parsed = pdfParse(await fs.promises.readFile(outputPath));
    return { result, parsed, plano: parsed.text.replace(/\s+/g, ' ') };
  }

  it('o RNTRC vem de infANTT, no cabeçalho e no campo do veículo de tração', async () => {
    expect(XML_XSD).not.toContain('<RNTRC>12345678</RNTRC>');
    const { plano } = await texto(XML_XSD, 'rntrc-antt');
    expect(plano).toMatch(/RNTRC:\s*87654321(?!\d)/);
    expect(plano).toMatch(/ABC1D23\s*\/\s*GO\s*\/\s*87654321/);
  });

  it('o RNTRC de emit e de veicTracao continua valendo quando não há infANTT', async () => {
    const { plano } = await texto(XML, 'rntrc-legado');
    expect(plano).toMatch(/RNTRC:\s*12345678(?!\d)/);
  });

  it('infANTT tem prioridade sobre os campos antigos', async () => {
    const { plano } = await texto(XML_XSD.replace('<enderEmit>', '<RNTRC>11111111</RNTRC><enderEmit>'), 'rntrc-prioridade');
    expect(plano).toMatch(/RNTRC:\s*87654321(?!\d)/);
    expect(plano).not.toContain('11111111');
  });

  it('traz RENAVAM e tara do veículo de tração', async () => {
    const { plano } = await texto(XML_XSD, 'renavam-tara');
    expect(plano).toContain('01234567890');
    expect(plano).toMatch(/\b8000\b/);
  });

  it('traz os reboques com placa, RENAVAM e tara', async () => {
    const { plano } = await texto(XML_XSD, 'reboques');
    expect(plano).toContain('REB1A11');
    expect(plano).toContain('09876543210');
    expect(plano).toMatch(/tara 6000 kg/);
  });

  it('traz o vale-pedágio com fornecedora, responsável, comprovante e valor', async () => {
    const { plano } = await texto(XML_XSD, 'vale-pedagio');
    expect(plano).toContain('11222333000181');
    expect(plano).toContain('COMP-777');
    expect(plano).toContain('150,50');
  });

  it('traz os lacres do modal e os do MDF-e', async () => {
    const comLacresDoMdfe = XML_XSD.replace('</infMDFe>', '<lacres><nLacre>LAC-MDFE-9</nLacre></lacres></infMDFe>');
    const { plano } = await texto(comLacresDoMdfe, 'lacres');
    expect(plano).toContain('LAC-001');
    expect(plano).toContain('LAC-002');
    expect(plano).toContain('LAC-MDFE-9');
  });

  it('sem reboque, vale-pedágio nem lacres, não desenha esses campos', async () => {
    const { plano } = await texto(XML, 'sem-extras');
    expect(plano).not.toContain('REBOQUE');
    expect(plano).not.toContain('LACRES');
  });

  it('com todos os campos a lista de documentos continua cabendo na folha e nenhum documento se perde', async () => {
    const chaves = Array.from({ length: 40 }, (_, i) => '3526101234567800019555001000000' + String(i).padStart(3, '0') + '1000000001');
    const grupos = chaves.map((c) => '<infNFe><chNFe>' + c + '</chNFe></infNFe>').join('');
    const xml = XML_XSD.replace(/<infNFe>[\s\S]*<\/infNFe>/, grupos);
    const { result, parsed } = await texto(xml, 'muitas-com-extras');
    expect(result.totalPaginas).toBeGreaterThan(2);
    expect(parsed.numpages).toBe(result.totalPaginas);
    const semEspacos = parsed.text.replaceAll(' ', '');
    const perdidas = chaves.filter((c) => !semEspacos.includes(c));
    expect(perdidas).toEqual([]);
  });
});

// Chaves fictícias, distintas por município, para provar que cada uma sai sob o município a que pertence.
const chaveNfe = (n: number) => '3526101234567800019555001' + String(n).padStart(9, '0') + '1000000001';
const chaveCte = (n: number) => '3526101234567800019557001' + String(n).padStart(9, '0') + '1000000001';
const municipio = (cod: string, nome: string, docs: string) => '<infMunDescarga><cMunDescarga>' + cod + '</cMunDescarga><xMunDescarga>' + nome + '</xMunDescarga>' + docs + '</infMunDescarga>';
const nfes = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => '<infNFe><chNFe>' + chaveNfe(de + i) + '</chNFe></infNFe>').join('');
const comMunicipios = (xml: string, municipios: string) => xml.replace(/<infDoc>[\s\S]*<\/infDoc>/, '<infDoc>' + municipios + '</infDoc>');

describe('MDFE_GerarDamdfe: documentos agrupados por município de descarga (Anexo II do MOC)', () => {
  async function ler(xml: string, nome: string) {
    const outputPath = '/tmp/mdfe-damdfe-' + nome + '.pdf';
    const result = await MDFE_GerarDamdfe({ data: xml, outputPath });
    const parsed = pdfParse(await fs.promises.readFile(outputPath));
    return { result, texto: parsed.text };
  }

  it('cada chave sai embaixo do título do seu município, na ordem do XML', async () => {
    const xml = comMunicipios(XML,
      municipio('3550308', 'São Paulo', '<infCTe><chCTe>' + chaveCte(1) + '</chCTe></infCTe>' + nfes(1, 2)) +
      municipio('3509502', 'Campinas', nfes(3, 3)));
    const { texto } = await ler(xml, 'municipios');
    const em = (s: string) => { const i = texto.indexOf(s); expect(i).toBeGreaterThanOrEqual(0); return i; };
    const tituloSp = em('MUNICÍPIO DE DESCARGA: São Paulo (3550308)');
    const tituloCampinas = em('MUNICÍPIO DE DESCARGA: Campinas (3509502)');
    expect(tituloSp).toBeLessThan(tituloCampinas);
    // as três de São Paulo ficam entre o título de São Paulo e o de Campinas; a de Campinas, depois do seu título
    [chaveCte(1), chaveNfe(1), chaveNfe(2)].forEach((c) => {
      expect(em(c)).toBeGreaterThan(tituloSp);
      expect(em(c)).toBeLessThan(tituloCampinas);
    });
    expect(em(chaveNfe(3))).toBeGreaterThan(tituloCampinas);
    expect(texto).toContain('3 documentos');
    expect(texto).toContain('1 documento');
    expect(texto).not.toContain('1 documentos');
  });

  it('o município que continua na folha seguinte repete o título, para a chave nunca ficar sem município', async () => {
    const chaves = Array.from({ length: 30 }, (_, i) => i + 1);
    const { result, texto } = await ler(comMunicipios(XML, municipio('3550308', 'São Paulo', nfes(1, 30))), 'continuacao');
    expect(result.totalPaginas).toBeGreaterThan(1);
    expect(texto).toContain('(continuação)');
    const semEspacos = texto.replaceAll(' ', '');
    expect(chaves.filter((n) => !semEspacos.includes(chaveNfe(n)))).toEqual([]);
  });

  it('o título de um município não fica sozinho no fim da folha', async () => {
    // 16 linhas cabem na primeira folha: as 15 do primeiro município (título e 14 chaves) deixam uma só livre.
    const xml = comMunicipios(XML, municipio('3550308', 'São Paulo', nfes(1, 14)) + municipio('3509502', 'Campinas', nfes(15, 17)));
    const { result, texto } = await ler(xml, 'titulo-orfao');
    expect(result.totalPaginas).toBe(2);
    expect(texto.indexOf('MUNICÍPIO DE DESCARGA: Campinas')).toBeGreaterThan(texto.indexOf('2/2'));
    expect(texto).not.toContain('(continuação)');
  });

  it('sem documento algum, diz que não há documentos vinculados', async () => {
    const { texto } = await ler(XML.replace(/<infDoc>[\s\S]*<\/infDoc>/, ''), 'sem-documentos');
    expect(texto).toContain('Sem documentos fiscais vinculados');
    expect(texto).not.toContain('MUNICÍPIO DE DESCARGA');
  });
});

// PNG 1x1 válido (vermelho), o mesmo de identidadeVisual.test.ts
const LOGO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
const FAIXA_DO_VANIR = 'HOMOLOGAÇÃO — SEM VALOR FISCAL';

describe('MDFE_GerarDamdfe: logo e faixa de ambiente do Vanir (como no DANFE e no DACTE)', () => {
  const imagens = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
  async function gerar(xml: string, nome: string, extras: { logo?: Buffer | null; faixaAmbiente?: string | null } = {}) {
    const outputPath = '/tmp/mdfe-damdfe-' + nome + '.pdf';
    await MDFE_GerarDamdfe({ data: xml, outputPath, ...extras });
    const pdf = await fs.promises.readFile(outputPath);
    return { pdf, texto: pdfParse(pdf).text };
  }

  it('com logo embute a imagem e mantém o emitente legível; sem logo, o desenho original', async () => {
    const sem = await gerar(XML, 'sem-logo');
    const com = await gerar(XML, 'com-logo', { logo: LOGO });
    expect(imagens(com.pdf)).toBeGreaterThan(imagens(sem.pdf));
    expect(com.texto).toContain('Transportadora Fictícia de Teste');
    expect(com.texto).toContain('12345678000195');
  });

  it('a faixaAmbiente passada substitui o texto padrão da homologação', async () => {
    const { texto } = await gerar(XML, 'faixa', { faixaAmbiente: FAIXA_DO_VANIR });
    expect(texto).toContain('SEM VALOR FISCAL');
    expect(texto).not.toContain('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO');
  });

  it('uma faixa personalizada aparece e o texto padrão não', async () => {
    const { texto } = await gerar(XML, 'faixa-propria', { faixaAmbiente: 'FAIXA PROPRIA DO VANIR' });
    expect(texto).toContain('FAIXA PROPRIA DO VANIR');
    expect(texto).not.toContain('EMITIDO EM AMBIENTE');
  });

  it('em produção a faixa não sai, mesmo passada (a marca é de homologação)', async () => {
    const { texto } = await gerar(XML.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>'), 'faixa-producao', { faixaAmbiente: 'FAIXA PROPRIA DO VANIR' });
    expect(texto).not.toContain('FAIXA PROPRIA DO VANIR');
  });

  it('logo e faixa nulos valem como ausentes', async () => {
    const { texto } = await gerar(XML, 'nulos', { logo: null, faixaAmbiente: null });
    expect(texto).toContain('EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO');
  });
});
