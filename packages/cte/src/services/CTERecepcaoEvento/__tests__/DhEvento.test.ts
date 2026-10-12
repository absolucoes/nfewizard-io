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
jest.mock('../../util/CTeSchema.js', () => ({ validarXmlCte: jest.fn().mockResolvedValue(undefined) }));
import { XmlBuilder } from '@nfewizard/shared';
import { agoraComOffsetBrasilia } from '../../util/DhEventoBrasilia';
import { CTECancelamentoService } from '../CTECancelamentoService';
import { CTEEventoCancCCeService } from '../CTEEventoCancCCeService';

// AAAA-MM-DDThh:mm:ss-03:00: o que o XSD do evento aceita (sem milissegundos, sem Z)
const FORMATO_XSD = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/;
const CHAVE = '41240111222333000181570010000000011123456782';

describe('agoraComOffsetBrasilia', () => {
    it('converte o instante UTC para o relógio de Brasília, sem milissegundos nem Z', () => {
        // container em UTC: 02:30 do dia 11 é 23:30 do dia 10 em Brasília
        expect(agoraComOffsetBrasilia(new Date('2026-10-11T02:30:00.123Z'))).toBe('2026-10-10T23:30:00-03:00');
    });

    it('não depende do fuso do processo', () => {
        const anterior = process.env.TZ;
        try {
            process.env.TZ = 'Asia/Tokyo';
            expect(agoraComOffsetBrasilia(new Date('2026-10-11T12:00:00Z'))).toBe('2026-10-11T09:00:00-03:00');
        } finally {
            if (anterior === undefined) delete process.env.TZ;
            else process.env.TZ = anterior;
        }
    });
});

describe('dhEvento gerado pela lib quando o chamador não informa', () => {
    it('evento genérico (CTERecepcaoEventoService) sai em horário de Brasília', () => {
        const environment = { getConfig: () => ({ nfe: { ambiente: 2 } }) };
        const real = new XmlBuilder(environment);
        const servico = new CTECancelamentoService(environment, undefined, { gerarXml: real.gerarXml.bind(real), assinarXML: (x) => x });
        const xml = servico['gerarXml']({ chCTe: CHAVE, tpEvento: '110111', nProt: '141240000000001', xJust: 'Erro de digitacao no valor' });
        const dh = xml.match(/<dhEvento>([^<]+)<\/dhEvento>/)[1];
        expect(dh).toMatch(FORMATO_XSD);
    });

    it('evento plano de cancelamento/CC-e (CTEEventoCancCCeService) sai em horário de Brasília', async () => {
        const xmlBuilder = { gerarXml: jest.fn((xml: any) => JSON.stringify(xml)), assinarXML: jest.fn((xml: string) => xml) };
        const servico = new CTEEventoCancCCeService(
            { getConfig: () => ({ dfe: { UF: 'GO' }, nfe: { ambiente: 2 } }) } as any,
            {} as any, xmlBuilder as any, {} as any, {} as any, {} as any,
        );
        await servico['gerarEvento']({
            chCTe: '52261012ABC34501DE35570010000000011123456787', cOrgao: 52, CNPJ: '11222333000181',
            nProt: '152260000000001', xJust: 'Motivo de cancelamento fictício.',
        }, '110111');
        expect(xmlBuilder.gerarXml.mock.calls[1][0].infEvento.dhEvento).toMatch(FORMATO_XSD);
    });

    it('respeita o dhEvento do chamador', () => {
        const environment = { getConfig: () => ({ nfe: { ambiente: 2 } }) };
        const real = new XmlBuilder(environment);
        const servico = new CTECancelamentoService(environment, undefined, { gerarXml: real.gerarXml.bind(real), assinarXML: (x) => x });
        const xml = servico['gerarXml']({ chCTe: CHAVE, tpEvento: '110111', nProt: '141240000000001', xJust: 'Erro de digitacao no valor', dhEvento: '2024-01-16T10:00:00-03:00' });
        expect(xml).toContain('<dhEvento>2024-01-16T10:00:00-03:00</dhEvento>');
    });
});
