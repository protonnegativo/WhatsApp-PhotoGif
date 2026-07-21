# Achados — rate limit de foto de perfil do WhatsApp

Notas técnicas da sessão de testes feita em 2026-07-21, direto contra o
servidor real do WhatsApp (conta pessoal, via Baileys). Documentando aqui
porque nada disso é público/documentado pela Meta — foi medido na unha.

## Resumo

- **Sim, existe rate limit real para troca de foto de perfil.** Não é
  suposição, é comportamento observado do servidor (`updateProfilePicture`
  falha com uma mensagem contendo `rate-overlimit`).
- **Fronteira real medida: falha em intervalos ≤7s, limpo em ≥8s.** 3s, 6s e
  7s todos bateram no limite em menos de 45s. 8s, 9s e 10s ficaram limpos em
  testes de ~90-150s seguidos, sem nenhuma falha (ver Teste 5).
- **Configuração atual do projeto: 8s** — o mais rápido confirmado seguro.
  9s/10s dão mais margem se preferir robustez a velocidade.
- **"Modo rajada" (ir rápido até bater o limite, esperar cooldown, repetir)
  não é uma forma segura de ganhar velocidade.** Testado e descartado — ver
  seção própria abaixo.
- **Amostra pequena.** Tudo abaixo veio de uma sessão, uma conta, ~20 minutos
  de teste. Não é garantia de que o WhatsApp não mude o comportamento, nem
  de que outra conta/região se comporte igual.

## Linha do tempo completa dos testes

### Teste 1 — intervalo fixo de 3s (primeira descoberta do limite)

```
Conectado ao WhatsApp.
[7:17:27 PM] frame-001  ok
[7:17:30 PM] frame-002  ok
[7:17:34 PM] frame-003  ok
[7:17:37 PM] frame-004  ok
[7:17:41 PM] frame-005  ok
[7:17:44 PM] frame-006  ok          <- 6 trocas em 17s, sem erro
... rate-overlimit x5 ...           <- trava por ~49s
[7:18:33 PM] frame-006  ok          <- 49s depois do último sucesso
[7:18:37 PM] frame-001  ok          <- mais 1, 4s depois
... rate-overlimit novamente ...
```

Leitura: rajada de 6 aceita, depois trava. ~49s de cooldown até aceitar de
novo, e mesmo assim só libera mais 1-2 antes de travar de novo.

### Teste 2 — intervalo fixo de 10s (validação da hipótese "6 por 60s")

```
Falha (rate-overlimit) x2                    <- resíduo do teste 1, mesma janela
[7:20:51 PM] frame-003  ok
[7:21:02 PM] frame-004  ok
[7:21:12 PM] frame-005  ok
[7:21:23 PM] frame-006  ok
[7:21:33 PM] frame-001  ok
[7:21:44 PM] frame-002  ok
[7:21:54 PM] frame-003  ok
[7:22:05 PM] frame-004  ok
[7:22:15 PM] frame-005  ok
[7:22:26 PM] frame-006  ok
```

10 sucessos seguidos, zero falhas, ~95s corridos. Depois, numa sessão
posterior no mesmo dia, mais 15 sucessos seguidos sem falha a 10-11s. **Esse
é o número que ficou de pé.**

### Teste 3 — "modo rajada" (fast=3s até falhar, cooldown=55s, repetir)

Hipótese testada: já que o servidor libera uma rajada antes de travar, por
que não disparar o mais rápido possível, deixar travar, esperar o cooldown
medido (55s) e repetir — usando 100% do limite em vez de andar devagar o
tempo todo?

```
[7:28:40 PM] frame-001  ok
[7:28:43 PM] frame-002  ok
[7:28:46 PM] rate-overlimit -> cooldown 55s
[7:29:42 PM] frame-003  ok           (56s depois, bate o cooldown)
[7:29:45 PM] frame-004  ok
[7:29:49 PM] frame-005  ok
[7:29:52 PM] frame-006  ok
[7:29:56 PM] frame-001  ok           <- 5 sucessos nessa rajada
[7:29:59 PM] rate-overlimit -> cooldown 55s
[7:30:54 PM] rate-overlimit -> cooldown 55s     <- ESSE é o dado importante:
                                                    o cooldown de 55s que
                                                    funcionou antes NÃO foi
                                                    suficiente dessa vez
[7:31:49 PM] frame-002  ok           <- só voltou depois de um SEGUNDO
                                         cooldown completo (~110s ao todo)
[7:31:53 PM] frame-003  ok
[7:31:56 PM] frame-004  ok
[7:31:59 PM] frame-005  ok
[7:32:03 PM] frame-006  ok
[7:32:06 PM] frame-001  ok           <- 6 sucessos nessa rajada
[7:32:09 PM] rate-overlimit -> cooldown 55s
```

**Total real do teste 3: 13 trocas bem-sucedidas, 4 batidas no rate limit**
(o relato que dei ao usuário na hora contou só 3 — a 4ª aconteceu no
intervalo entre eu decidir parar o teste e efetivamente rodar o comando de
kill, porque o processo continuou vivo e rodando sozinho por mais um ciclo
de cooldown nesse meio-tempo).

**Por que descartei o modo rajada:** o ponto crítico é a falha em
`[7:30:54 PM]` — o mesmo cooldown de 55s que tinha funcionado 55s antes
(`[7:29:42 PM]`) parou de ser suficiente na tentativa seguinte, e só voltou a
aceitar depois de basicamente o dobro do tempo. Isso é sinal de que o
mecanismo de limite do WhatsApp não é um contador simples e fixo (tipo "6 por
janela de 60s" e pronto) — parece escalar a punição pra quem bate nele
repetidamente. Continuar insistindo nessa direção arrisca deixar a conta
num estado de bloqueio pior ou mais longo, sem eu ter visibilidade real de
qual é o teto desse escalonamento. Não vale o risco só pra ganhar
velocidade de animação.

### Teste 4 — intervalo fixo de 6s

Pergunta direta: e algo entre 3s e 10s, tipo 6s, sustenta? Testado isolado
(bot principal pausado no pm2 antes, PID capturado manualmente pra matar
com precisão assim que aparecesse falha):

```
Conectado ao WhatsApp.
[7:48:48 PM] frame-001  ok
[7:48:55 PM] frame-002  ok
[7:49:01 PM] frame-003  ok
[7:49:08 PM] frame-004  ok
[7:49:14 PM] frame-005  ok           <- 5 sucessos em 26s
rate-overlimit                        <- falhou na 6ª tentativa, ~32s do início
```

Morto por PID logo em seguida (sem deixar rodando pra "ver se recupera" -
uma falha isolada já é resposta suficiente, não precisa repetir o padrão do
teste 3). **Conclusão parcial na hora: 6s também bate no limite** — mas essa
conclusão foi revisada no teste 5 abaixo, que mapeou a fronteira exata.

### Teste 5 — varredura 7s/8s/9s (achar a fronteira exata)

Pedido do usuário: testar todos os valores entre 3s e 10s antes de aceitar
"só 10s funciona". Em vez de testar 1-9s um por um (o que significaria bater
o rate limit de propósito várias vezes, arriscando escalar a punição como no
teste 3), explorei de cima pra baixo aproveitando que a relação é monotônica
(se um intervalo maior falha, todo intervalo menor também falha) — parar no
primeiro que falhasse encerraria a busca por baixo. Na prática nenhum dos
três falhou nesse teto de tempo, então os três ficam documentados:

```
7s: [6:56 -> 7:33] 6 sucessos em 37s, FALHOU na 7ª tentativa (~44s)
8s: [7:55:03 -> 7:56:36] 12 sucessos em 93s, ZERO falhas (matei por timeout do teste, não por falha)
9s: [7:52:57 -> 7:54:31] 11 sucessos em 94s, ZERO falhas (matei por timeout do teste, não por falha)
```

**Isso muda a conclusão do teste 4.** A fronteira real não fica perto de
10s — fica entre 7s (falha) e 8s (limpo). 8s e 9s se sustentaram por ~90s
inteiros sem nenhum sinal de `rate-overlimit`, bem além do ponto em que 3s,
6s e 7s todos já tinham falhado (17-44s). Ressalva: só testamos ~90-95s
corridos em cada um, não horas — não há garantia de que 8s/9s continuem
limpos numa operação de dias, só que são nitidamente mais robustos que
qualquer coisa abaixo de 7s.

## Conclusão prática

- **Fronteira real medida: falha em ≤7s, limpo em ≥8s.** 8s é o mais rápido
  confirmado seguro; 9s e 10s dão mais margem de segurança acima da
  fronteira de falha, ao custo de serem um pouco mais lentos.
- **Configuração que ficou como padrão do projeto: 8s.** Se em uso
  prolongado (dias) aparecer `rate-overlimit` nos logs, isso é sinal pra
  subir esse valor de volta pra 9s ou 10s antes de qualquer outra coisa —
  não insistir tentando "recuperar" no mesmo valor (ver lição do teste 3).
- Não existe gambiarra conhecida e segura pra ficar mais rápido que 8s.
  A rajada foi tentada e descartada pelos motivos do teste 3.
- Se algum dia quiser retestar limites (ex: WhatsApp pode mudar o
  comportamento no futuro), faça isso sabendo que já vimos indício de
  penalidade escalável — não repita o teste de rajada sem um bom motivo, e
  se repetir, pare no primeiro sinal de cooldown "que não segurou".

## Lição operacional (não é sobre WhatsApp, é sobre como eu conduzi o teste)

Ao decidir parar um processo que está rodando em loop com base num log que
já li, o log pode estar desatualizado no momento em que o comando de parar
de fato executa — o processo continua vivo e agindo sozinho nesse intervalo.
Da próxima vez: capturar o PID no momento do start e matar por PID
diretamente (`kill <pid>`), e sempre reconferir com um `ps` alguns segundos
depois do kill antes de assumir que parou, em vez de confiar num único
snapshot de log já defasado.
