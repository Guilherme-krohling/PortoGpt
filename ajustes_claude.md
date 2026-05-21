# Instruções de Ajustes (Claude Code)

Por favor, realize as seguintes correções e melhorias no sistema:

## 1. Ajuste no fluxo de salvamento de Templates
*   **Comportamento Atual:** O template está sendo salvo no banco de dados/backend logo na etapa de preenchimento do formulário preliminar. Isso causa um problema: se o usuário desistir de criar o template na etapa seguinte (tela de edição HTML), o template já terá sido salvo indevidamente e ficará "órfão" ou incompleto.
*   **Comportamento Esperado:** Mude o ponto exato de salvamento. O formulário inicial deve servir apenas para coletar os dados e abrir a próxima tela (tela de HTML), **sem realizar nenhum salvamento ou requisição de criação**. A criação e o salvamento oficial do template só devem ocorrer na tela de HTML, após a confirmação final do usuário.

## 2. Persistência do botão "Visualizar documento formatado" no Chat
*   **Comportamento Atual:** O botão "Visualizar documento formatado" (que permite visualizar e baixar o PDF formatado) desaparece do histórico da conversa quando o usuário recarrega a página ou quando sai e volta para a tela de chat. Ao carregar o histórico, fica apenas o texto da mensagem ("Documento formatado com sucesso..."), e o usuário perde o acesso ao arquivo, precisando solicitar a formatação tudo de novo.
*   **Comportamento Esperado:** O componente da mensagem e o estado do botão devem ser totalmente persistidos no histórico do chat. Ao recarregar a conversa, a mensagem deve sempre renderizar o botão "Visualizar documento formatado" em conjunto com o texto. O botão deve continuar vinculado ao arquivo/URL gerado naquela ação específica, garantindo que o usuário possa visualizar ou baixar o PDF a qualquer momento futuro apenas acessando o histórico da conversa.

## 3. Divergência entre Visualização e Download do PDF (Requer Investigação)
*   **Problema a ser investigado:** O arquivo PDF gerado para download não está fiel à visualização exibida dentro do sistema. Peço que **investigue a fundo o que pode estar causando essa divergência** no momento da conversão/geração do arquivo, pois o documento baixado deve ser **exatamente igual** ao que o usuário visualiza no sistema.
*   **Exemplos das divergências encontradas:**
    1. **Logo distorcida:** A logo no arquivo baixado está visivelmente estranha e com as proporções distorcidas.
    2. **Cabeçalho desformatado:** Cadê a linha de divisão do cabeçalho? Ela simplesmente sumiu. Além disso, o nome "PORTOGPT" está alinhado à esquerda, mas no modelo da visualização ele é centralizado.
    3. **Rodapé e Numeração de Página:** No arquivo baixado, a numeração de página foi parar no centro, enquanto no modelo da visualização ela fica posicionada corretamente à direita. O rodapé parece estar totalmente quebrado ou não sendo renderizado.
*   **Comportamento Esperado:** Resolva esse problema de renderização. O download final do PDF tem que ser **exatamente igual** ao documento exibido na tela de visualização (após clicar no botão "Visualizar documento formatado"). Ele deve preservar perfeitamente toda a formatação do cabeçalho (alinhamento centralizado, linha de divisão), incluir o rodapé completo (com a logo com proporção correta e numeração de página à direita) e também manter os textos na formatação e espaçamento corretos, exatamente como está renderizado no HTML.
