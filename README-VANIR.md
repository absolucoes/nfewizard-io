# Fork Vanir do nfewizard-io

Cópia própria da Absoluções do [nfewizard-io](https://github.com/nfewizard-org/nfewizard-io), que o Vanir ERP consome.
Corrige o que o upstream ainda não tem e traz CT-e, MDF-e e DANFE/DACTE/DAMDFE já integrados. O que mudou e por quê
está em [`CHANGELOG-VANIR.md`](CHANGELOG-VANIR.md).

## Branches

| Branch | Papel |
| --- | --- |
| `vanir/main` | **Padrão do fork.** Upstream + CT-e + MDF-e + DANFE (DACTE e DAMDFE) + `shared` + as correções. Nunca fica atrás do upstream. |
| `master` | Espelho do `master` do upstream (avança só em fast-forward, pelo fluxo de sincronização). |
| `sincronizar/<data>` | Branch do robô de sincronização; só existe enquanto o PR dela está aberto. |
| `vanir/cte-qrcode-eventos` | **Congelada.** Era a base do CT-e do Vanir (tag `vanir-cte-v1.0.3-vanir.2`). Substituída por `vanir/main`. |
| `vanir/mdfe` | **Congelada.** Era a base do MDF-e do Vanir (tag `vanir-mdfe-v1.0.0-vanir.1`). Substituída por `vanir/main`. |

As duas branches congeladas e as tags `vanir-cte-v…` / `vanir-mdfe-v…` ficam como estão: o que o Vanir já instalou
continua resolvendo. Nada novo sai delas.

## Fluxos (GitHub Actions)

- **CI** (`ci-vanir.yml`): em PR e em push para `vanir/main`, `pnpm install --frozen-lockfile && pnpm -r build && pnpm -r test`.
- **Sincronizar** (`sincronizar-upstream.yml`, diário e manual): traz o upstream por PR (verde, teste quebrado ou conflito). Nunca empurra
  em `vanir/main`, nunca cria tag. A entrada `ref` permite ensaiar com outro ponto do upstream.
- **Publicar** (`publicar-vanir.yml`): a tag `vanir-v<N>` publica no GitHub Packages, com o mesmo N, os seis pacotes
  `@absolucoes/nfewizard-{io,shared,types,cte,mdfe,danfe}@<versão do upstream>-vanir.<N>` (dist-tag `vanir`, acesso restrito).
  A tag precisa estar em `vanir/main`; N repetido é recusado.

## Instalar no Vanir

```
# .npmrc (somente leitura)
@absolucoes:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```
pnpm add @absolucoes/nfewizard-io@1.1.4-vanir.1
```

As dependências internas entram como alias (`@nfewizard/shared` aponta para `@absolucoes/nfewizard-shared`), então nenhum
`@nfewizard/*` do npmjs é instalado.
