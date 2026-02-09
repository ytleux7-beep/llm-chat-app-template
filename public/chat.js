// Interfaces
interface ChatMsg { role: 'user' | 'assistant'; content: string; }

const chatBox = document.getElementById("chat-messages") as HTMLDivElement;
const input = document.getElementById("user-input") as HTMLTextAreaElement;
const btn = document.getElementById("send-button") as HTMLButtonElement;
const loader = document.getElementById("typing-indicator") as HTMLDivElement;

let history: ChatMsg[] = [];

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    // UI Update
    addBubble('user', text);
    input.value = '';
    input.disabled = true;
    btn.disabled = true;
    loader.classList.add('visible');

    history.push({ role: 'user', content: text });

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history }),
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let aiText = "";
        
        // إنشاء فقاعة الـ AI فارغة للبدء بالتحديث
        const aiBubble = addBubble('assistant', "");
        const aiContent = aiBubble.querySelector('p')!;

        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            // معالجة بسيطة للـ SSE
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.slice(5).trim();
                    if (data === '[DONE]') break;
                    try {
                        const json = JSON.parse(data);
                        aiText += json.response || "";
                        aiContent.textContent = aiText;
                        chatBox.scrollTop = chatBox.scrollHeight;
                    } catch(e) {}
                }
            }
        }
        history.push({ role: 'assistant', content: aiText });
    } catch (err) {
        addBubble('assistant', "Error connecting to AI.");
    } finally {
        input.disabled = false;
        btn.disabled = false;
        loader.classList.remove('visible');
        input.focus();
    }
}

function addBubble(role: 'user' | 'assistant', content: string) {
    const div = document.createElement('div');
    div.className = `message ${role}-message`;
    div.innerHTML = `<p>${content}</p>`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
}

btn.addEventListener('click', sendMessage);
input.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }});
