# CHANGELOG-VANIR

O que `vanir/main` tem a mais (ou diferente) do upstream `nfewizard-org/nfewizard-io`, e o teste que prova cada correção.
Cada linha: pacote, motivo, teste que a prova (e o que acontece sem ela), PR no upstream (se houver).
Regra: correção sem teste que falhe sem ela não entra aqui.

## Integração (sem correção)

- **cte**: o CT-e do Vanir (QR Code, eventos, validação de XSD) foi integrado sobre o motor de CT-e do upstream. Onde os dois divergiam, vale o
  motor do upstream e as peças próprias do fork foram reaplicadas em cima. A API de evento plana (`CTEEventoCancCCeService`) do fork foi mantida.
- **mdfe**: o pacote do fork entra como está no `vanir/mdfe`, com o DAMDFE em `danfe`.
- **danfe**: DACTE e DAMDFE vêm do fork; DANFE/NFC-e seguem do upstream.

## Correções

| Pacote | Correção e motivo | Teste que a prova | Sem a correção | Upstream |
| --- | --- | --- | --- | --- |
| shared | XSD da NF-e aceita `tpNFCredito` 04 a 06 e CNPJ alfanumérico na chave e nos tipos; o XSD publicado recusava ambos | `packages/shared/src/utils/__tests__/SchemaNFeAlfanumerico.test.ts` | 3 de 6 testes falham | - |
| danfe | `logo` (Buffer) opcional no DANFE e no DACTE, com o texto do emitente deslocado | `packages/danfe/src/generators/identidadeVisual.test.ts` (logo, NF-e e CT-e) | os testes de logo falham (5 de 7 do arquivo falham no conjunto) | - |
| danfe | `faixaAmbiente` opcional troca o texto de homologação; sem ela o texto original permanece | idem (faixa, NF-e e CT-e) | idem | - |
| danfe | DANFE de item autorizado sem grupo de ICMS (serviço) caía com `TypeError` | idem (`gera o DANFE de um item autorizado sem grupo de ICMS`) | TypeError | - |
| danfe | DACTE com a mesma identidade visual do DANFE (logo e faixa), como no brief 08 do Vanir | idem (bloco `DACTE (CT-e)`) | idem | - |
| danfe | DAMDFE lê o RNTRC de `rodo/infANTT/RNTRC`, onde o XSD 3.00 o põe, no cabeçalho e no campo do veículo de tração (`emit.RNTRC` e `veicTracao.RNTRC` ficam só como recurso, depois do `infANTT`); antes o campo saía vazio ("RNTRC:") | `packages/danfe/src/generators/MDFEGerarDamdfe.test.ts` (`o RNTRC vem de infANTT`, `infANTT tem prioridade`) | 2 testes falham | - |
| danfe | DAMDFE com RENAVAM e tara do veículo de tração, reboques (placa, UF, RENAVAM, tara, capacidade), vale-pedágio (fornecedora, responsável, comprovante, valor) e lacres (do modal e do MDF-e), como no Anexo II do MOC; campos de reboque, vale-pedágio e lacres só aparecem quando informados e a lista de documentos recalcula quantos cabem por folha | idem (`traz RENAVAM e tara`, `reboques`, `vale-pedágio`, `lacres`, `sem reboque...`, `nenhum documento se perde`; os dois últimos são guarda e passam também sem a correção) | 4 testes falham | - |
| cte | `dhEvento` gerado pela lib em horário de Brasília, `AAAA-MM-DDThh:mm:ss-03:00`, sem milissegundos e sem `Z`, na origem, nos dois motores de evento; independe do fuso do processo | `packages/cte/src/services/CTERecepcaoEvento/__tests__/DhEvento.test.ts`; `.mjs` igual a `.cjs` em `pnpm --filter @nfewizard/cte test:dist` | 4 de 5 testes falham | - |
| cte | `ide/toma4` na ordem do XSD (`toma` antes do documento); o tomador "outros" era recusado com `Element CNPJ is not expected. Expected is toma` | `packages/cte/src/services/CTEAutorizacao/__tests__/CTEAutorizacaoXsd.test.ts` | o teste de XML de referência falha com a rejeição acima | - |
| cte | CT-e com expedidor e recebedor passa no `cte_v4.00.xsd` e bate com um XML de referência (golden) | idem, `ouro/cte-toma4-exped-receb.xml` | idem | - |
| cte | `validarXmlCte` acha os XSD pelo caminho do módulo, não pelo `cwd`; no pacote instalado o `cwd` é o do cliente | `pnpm --filter @nfewizard/cte test:dist` (roda `dist/index.cjs` e `dist/index.mjs` de um diretório fora do pacote) | os 5 XSD deixam de ser encontrados nos dois formatos | - |
| cte | `cCT` informado no payload entra na chave de acesso e é devolvido ao objeto | `CTEAutorizacaoXsd.test.ts` (bloco `cCT`) | **já era comportamento do upstream**: o teste fica como guarda; não falha ao retirar a correção porque ela não é mais necessária | - |
| mdfe | Envelope SOAP por operação (MDFeRecepcaoSinc, MDFeRecepcaoEvento, MDFeConsulta, MDFeStatusServico, MDFeConsNaoEnc): `mdfeCabecMsg` (cUF, versaoDados) no Header, sem elemento da operação em volta do `mdfeDadosMsg`, `action` com o método, XML como nó e não escapado | `packages/mdfe/src/util/MDFeSoap.test.ts` (bloco do envelope) e `MDFeTransmissao.test.ts` | 12 testes falham | - |
| mdfe | Retorno da consulta de situação lê `retConsSitMDFe` (antes valia o `cStat` do evento que ela carrega); lista de não encerrados (`retConsMDFeNaoEnc`) devolve as chaves | `MDFeSoap.test.ts` (bloco `retornos do MDF-e`) | 3 testes falham | - |
| mdfe | `ide` sai na sequência do XSD, qualquer que seja a ordem do payload | `MDFeSoap.test.ts` (`ordem de ide`) | 1 teste falha | - |
| mdfe | XSD achados pelo caminho do módulo, não pelo `cwd` | `MDFeSoap.test.ts` (`caminho dos XSD`) e `pnpm --filter @nfewizard/mdfe test:dist` | 2 testes falham | - |
| mdfe | Testes só com dados fictícios no formato dos exemplos públicos do leiaute e do WSDL; nenhum XML de emissão real | (regra para os testes do pacote) | - | - |

## Não implementado de propósito

- **Evento 610110 (prestação de serviço em desacordo, CT-e)**: não implementado de propósito na API de evento plana do fork
  (`CTEEventoCancCCeService`: cancelamento e CC-e, a que o Vanir usa). O evento existe só no motor genérico de eventos do
  upstream (`CTEWizard`/`CTERecepcaoEventoService`), mantido como veio, sem uso do fork. O Vanir não emite 610110 até haver caso de uso e homologação.

## Dívida do DAMDFE

- O DAMDFE ainda não agrupa os documentos por município de descarga (lista plana de tipo e chave) nem imprime logo e faixa de ambiente do emitente, como o DANFE e o DACTE.

## Pendente de conferência

- Os nomes de método do `action` SOAP do MDF-e (`mdfeRecepcao`, `mdfeRecepcaoEvento`, `mdfeConsultaMDF`,
  `mdfeStatusServicoMDF`, `mdfeConsNaoEnc`) vêm do projeto sped-mdfe. O WSDL da SVRS não estava acessível na escrita
  e eles ainda precisam ser conferidos contra ele (homologação).
