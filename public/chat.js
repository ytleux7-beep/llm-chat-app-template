/**
 * Astra AI - Frontend Logic (TypeScript)
 */

interface ChatMsg { 
    role: 'user' | 'assistant'; 
    content: string; 
}

// تعريف العناصر بدقة مع الأنواع (Types)
const chatBox = document.getElementById("chat-messages") as HTMLDivElement;
const input = document.getElementById("user-input") as HTMLTextAreaElement;
const btn = document.getElementById("send-button") as HTMLButtonElement;
const loader = document.getElementById("typing-indicator") as HTMLDivElement;
const modelSelect = document.getElementById("model-select") as HTMLSelectElement;

let history: ChatMsg[] = [];

/**
 * دالة إرسال الرسالة ومعالجة الرد
 */
async function sendMessage() {
    const text = input.value.trim();
    const selectedModel = modelSelect.value; // جلب النموذج المختار (Astra 2.5 أو Astra 3.0 Pro)

    if (!text) return;

    // تحديث الواجهة وتعطيل الإدخال
    addBubble('user', text);
    input.value = '';
    input.disabled = true;
    btn.disabled = true;
    
    // إظهار الـ Spinner من مسار src/spinner.svg (يتم التحكم به عبر CSS/HTML)
    loader.classList.add('visible');

    history.push({ role: 'user', content: text });

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                messages: history,
                model: selectedModel // إرسال نوع النموذج للسيرفر
            }),
        });

        if (!response.body) throw new Error("ReadableStream not supported");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiFullText = "";
        
        // إنشاء فقاعة الـ AI فارغة وتجهيزها للاستقبال (Streaming)
        const aiBubble = addBubble('assistant', "");
        const aiContent = aiBubble.querySelector('.content-text') as HTMLParagraphElement;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const dataLine = line.slice(5).trim();
                    if (dataLine === '[DONE]') break;
                    
                    try {
                        const json = JSON.parse(dataLine);
                        // دعم صيغ استجابة Cloudflare Workers AI
                        const content = json.response || json.choices?.[0]?.delta?.content || "";
                        aiFullText += content;
                        
                        // تحديث النص حياً في الواجهة
                        aiContent.textContent = aiFullText;
                        chatBox.scrollTop = chatBox.scrollHeight;
                    } catch(e) {
                        // تجاهل أخطاء البارسنج الصغيرة أثناء البث
                    }
                }
            }
        }
        history.push({ role: 'assistant', content: aiFullText });

    } catch (err) {
        console.error("Astra AI Error:", err);
        addBubble('assistant', "عذراً، حدث خطأ في الاتصال بـ Astra AI. يرجى المحاولة مرة أخرى.");
    } finally {
        // إعادة تفعيل الواجهة
        input.disabled = false;
        btn.disabled = false;
        loader.classList.remove('visible');
        input.focus();
    }
}

/**
 * دالة إضافة الفقاعات للدردشة مع دعم الأفاتار
 */
function addBubble(role: 'user' | 'assistant', content: string) {
    const div = document.createElement('div');
    div.className = `message ${role}-message`;
    
    // إذا كان المساعد، نضع صورة الأفاتار من مجلد src
    const avatarImg = role === 'assistant' 
        ? `<img src="src/avatar.png" class="msg-avatar" alt="Astra">` 
        : '';

    div.innerHTML = `
        ${avatarImg}
        <div class="msg-body">
            <p class="content-text">${content}</p>
        </div>
    `;
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
}

// المستمعات (Event Listeners)
btn.addEventListener('click', sendMessage);

input.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        sendMessage(); 
    }
});

// تحسين تلقائي لارتفاع حقل النص
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = (input.scrollHeight) + 'px';
});
