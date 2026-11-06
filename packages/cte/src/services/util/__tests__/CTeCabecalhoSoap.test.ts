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
import { CTEAutorizacaoService } from '../../CTEAutorizacao/CTEAutorizacaoService';
import { CTEDistribuicaoDFeService } from '../../CTEDistribuicaoDFe/CTEDistribuicaoDFeService';
import { CTEStatusServicoService } from '../../CTEStatusServico/CTEStatusServicoService';

const ACTION = 'http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao';

function preparar(service, uf) {
    const post = jest.fn().mockResolvedValue({ data: '<ok/>' });
    service.environment = { config: { dfe: { UF: uf } }, getConfig: () => ({ dfe: { UF: uf } }) };
    service.axios = { post };
    return post;
}

/**
 * O CT-e 4.00 é SOAP 1.2 em todos os autorizadores (SVRS, SVSP, MG, MS, MT, PR, SP), e o
 * SOAP 1.2 leva a operação no `action` do Content-Type. Sem ela a SVRS (que atende GO, entre
 * outras UF) responde "Requisição de nome para método não implementado".
 */
describe.each(['GO', 'SP', 'PR', 'RS'])('Content-Type do CT-e com emitente em %s', (uf) => {
    const servicos = [
        ['autorização', () => new CTEAutorizacaoService()],
        ['distribuição DF-e', () => new CTEDistribuicaoDFeService()],
        ['serviços com a base comum', () => new CTEStatusServicoService()],
    ];

    it.each(servicos)('%s envia application/soap+xml com a action', async (_nome, criar) => {
        const service = criar();
        const post = preparar(service, uf);

        const ContentType = service['setContentType']();
        await service['callWebService']('<soap/>', 'https://exemplo/ws', ContentType, ACTION, {});

        const { headers } = post.mock.calls[0][2];
        expect(headers['Content-Type']).toBe(`application/soap+xml; action="${ACTION}"`);
        expect(headers.SOAPAction).toBeUndefined();
    });
});
