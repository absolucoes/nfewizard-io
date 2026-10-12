// @ts-nocheck
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CTEAutorizacaoService } from '../CTEAutorizacaoService';
import { SCHEMA_POR_RAIZ, validarXmlCte } from '../../util/CTeSchema';

// Documentos 100% fictícios: CNPJ/CPF com dígito verificador válido, mas de ninguém.
const endereco = { xLgr: 'Rua A', nro: '1', xBairro: 'Centro', cMun: '5208707', xMun: 'Goiânia', CEP: '74000000', UF: 'GO' };

function payloadCte(participantes: Record<string, any> = {}) {
    return {
        infCte: {
            ide: {
                cUF: 52, cCT: '12345678', CFOP: '5352', natOp: 'Prestação de serviço de transporte', mod: 57, serie: 1,
                nCT: 702, dhEmi: '2026-10-10T12:00:00-03:00', tpImp: 1, tpEmis: 1, tpAmb: 2, tpCTe: 0, procEmi: 0,
                cMunEnv: '5208707', xMunEnv: 'Goiânia', UFEnv: 'GO', modal: '01', tpServ: 0,
                cMunIni: '5208707', xMunIni: 'Goiânia', UFIni: 'GO', cMunFim: '5208707', xMunFim: 'Goiânia', UFFim: 'GO',
                retira: 0, indIEToma: 9,
                ...participantes.ide,
            },
            emit: { CNPJCPF: '12345678000195', IE: '101234567', xNome: 'Transportadora Teste', enderEmit: endereco, CRT: 3 },
            rem: { CNPJCPF: '12345678909', xNome: 'Remetente', enderReme: endereco },
            ...(participantes.exped ? { exped: participantes.exped } : {}),
            ...(participantes.receb ? { receb: participantes.receb } : {}),
            dest: { CNPJCPF: '98765432100', xNome: 'Destinatario', enderDest: endereco },
            vPrest: { vTPrest: 100, vRec: 100, Comp: { xNome: 'Frete', vComp: 100 } },
            imp: { ICMS: { ICMS45: { CST: '40' } } },
            infCTeNorm: {
                infCarga: { vCarga: 100, proPred: 'Mercadoria', infQ: { cUnid: '01', tpMed: 'PESO BRUTO', qCarga: '1.5000' } },
                infDoc: { infNFe: { chave: '11111111111111111111111111111111111111111111' } },
                infModal: { $: { versaoModal: '4.00' }, rodo: { RNTRC: '12345678' } },
            },
            autXML: { CPF: '12345678909' },
        },
    };
}

function criarServico() {
    const { XmlBuilder } = require('@nfewizard/shared');
    const real = new XmlBuilder({});
    return new CTEAutorizacaoService(
        undefined,
        { getWebServiceUrl: () => 'https://qr.example/qrcode', getSvcCTe: () => 'SVC-SP' },
        { gerarXml: real.gerarXml.bind(real), assinarXML: (x) => x },
    );
}

// O XSD exige a assinatura; o conteúdo dela não é conferido aqui (a lib assina em outro teste), só a estrutura.
const ASSINATURA_FICTICIA = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#CTe52261012345678000195570010000007021123456780"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>AA==</DigestValue></Reference></SignedInfo><SignatureValue>AA==</SignatureValue><KeyInfo><X509Data><X509Certificate>AA==</X509Certificate></X509Data></KeyInfo></Signature>';
const assinado = (xml: string) => xml.replace('</CTe>', ASSINATURA_FICTICIA + '</CTe>');

const OURO = path.resolve(__dirname, 'ouro/cte-toma4-exped-receb.xml');

describe('CTEAutorizacaoService - ide/toma4 (tomador "outros")', () => {
    it('mantém toma antes do documento, na ordem do XSD', () => {
        const servico = criarServico();
        const toma4 = servico['normalizaToma4']({ toma: 4, CNPJCPF: '11444777000161', xNome: 'Tomador', enderToma: endereco });
        expect(Object.keys(toma4).slice(0, 3)).toEqual(['toma', 'CNPJ', 'xNome']);
    });

    it('gera um CT-e com toma4, expedidor e recebedor que passa no XSD oficial e bate com o XML de referência', async () => {
        const payload = payloadCte({
            ide: { toma4: { toma: 4, CNPJCPF: '11444777000161', xNome: 'Tomador', enderToma: endereco } },
            exped: { CNPJCPF: '11444777000161', xNome: 'Expedidor', enderExped: endereco },
            receb: { CNPJCPF: '98765432100', xNome: 'Recebedor', enderReceb: endereco },
        });
        // `ide` termina em toma4, que vem depois de indIEToma no XSD: a ordem de entrada é a do leiaute
        const xml = criarServico()['gerarXml'](payload);

        await expect(validarXmlCte(assinado(xml), SCHEMA_POR_RAIZ.CTe)).resolves.toBeUndefined();

        if (process.env.ATUALIZAR_OURO === '1' || !existsSync(OURO)) writeFileSync(OURO, xml, 'utf8');
        expect(xml).toBe(readFileSync(OURO, 'utf8'));
        // o expedidor e o recebedor entram entre rem e dest, com o documento antes do nome
        expect(xml).toMatch(/<\/rem><exped><CNPJ>11444777000161<\/CNPJ><xNome>[^<]+<\/xNome><enderExped>/);
        expect(xml).toMatch(/<\/exped><receb><CPF>98765432100<\/CPF><xNome>[^<]+<\/xNome><enderReceb>/);
        expect(xml).toContain('<toma4><toma>4</toma><CNPJ>11444777000161</CNPJ>');
    });
});

describe('CTEAutorizacaoService - cCT', () => {
    it('usa o cCT do payload na chave de acesso e o devolve ao objeto original', () => {
        const payload = payloadCte();
        const xml = criarServico()['gerarXml'](payload);
        expect(payload.infCte.ide.cCT).toBe('12345678');
        expect(xml).toContain('<cCT>12345678</cCT>');
        // cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nCT(9) tpEmis(1) cCT(8) DV(1): o cCT são os oito antes do DV
        const chave = xml.match(/Id="CTe(\d{44})"/)[1];
        expect(chave.slice(35, 43)).toBe('12345678');
    });
});
