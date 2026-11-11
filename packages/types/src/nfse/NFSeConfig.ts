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

import { NFeWizardProps } from '../shared/NFeWizardProps.js';

/**
 * Leiautes de DPS que o montador sabe produzir (ver NFSeConfig.nfse.leiaute).
 */
export type LeiauteDPS = '1.01' | 'nt009-r1';

/**
 * Configuração para NFSeWizard.
 * Herda toda a estrutura de NFeWizardProps (dfe, email, lib), exceto o bloco
 * de parametrização do documento fiscal: aqui a chave é "nfse" (em vez de
 * "nfe", usada por NFe/NFCe), pois é o nome mais adequado ao contexto deste pacote.
 */
export type NFSeConfig = Omit<NFeWizardProps, 'nfe'> & {
    /**
     * @param {obj} nfse - Configurações relacionadas ao processo de NFSe
     */
    nfse: {
        /**
         * @param {number} ambiente - Define o ambiente que receberá o DPS:
         * 1 = Produção
         * 2 = Homologação
         */
        ambiente: number;
        /**
         * @param {string} versao - Versão do aplicativo emissor (verAplic)
         */
        versao?: string;
        /**
         * @param {string} leiaute - Leiaute do DPS que a lib monta e assina:
         * '1.01'      = leiaute vigente (padrão, se omitido);
         * 'nt009-r1'  = leiaute da NT 009 SE/CGNFS-e, release 1 (XSD de homologação
         *               restrita), com finNFSe em infDPS e IBSCBS reestruturado.
         * Os dois nunca se misturam: DPS no formato de um leiaute entregue à lib
         * configurada para o outro é recusado, em vez de gerar XML que a SEFIN rejeita.
         */
        leiaute?: LeiauteDPS;
    };
};
