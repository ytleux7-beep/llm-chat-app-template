/**
 * LLM Chat App Frontend - TypeScript Version
 * Handles the chat UI interactions and communication with the backend API.
 */

// 1. تعريف الأنواع (Interfaces) لضمان سلامة البيانات
interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface WorkerAIResponse {
    response?: string;
    choices?: Array<{
        delta?: {
            content?: string;
        }
    }>;
}

interface SSEResult {
    events: string[];
    buffer: string;
}

// 2. تعريف عناصر الـ DOM مع تحديد أنواعها بدقة
// نستخدم 'as HTML...' لأننا متأكدون من وجود هذه العناصر في ملف HTML
const chatMessages = document.getElementById("chat-messages") as HTMLDivElement;
const userInput = document.getElementById("user-input") as HTMLTextAreaElement;
const sendButton = document.getElementById("send-button") as HTMLButtonElement;
const typingIndicator = document.getElementById("typing-indicator") as HTMLDivElement;

// 3. حالة المحادثة (State)
let chatHistory: ChatMessage[] = [
    {
        role: "assistant",
        content: "Hello! I'm an AI assistant. How can I help you navigate the future today?",
    },
];

let isProcessing: boolean = false;

// 4. ضبط ارتفاع مربع النص تلقائياً عند الكتابة
userInput.addEventListener("input", function (this: HTMLTextAreaElement) {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
});

// 5. إرسال الرسالة عند ضغط Enter
userInput.addEventListener("keydown", function (e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// التعامل مع زر الإرسال
sendButton.addEventListener("click", () => sendMessage());

/**
 * دالة الإرسال الرئيسية
 */
async function sendMessage(): Promise<void> {
    const message = userInput.value.trim();

    // عدم الإرسال إذا كان الحقل فارغاً أو هناك عملية جارية
    if (message === "" || isProcessing) return;

    // تعطيل المدخلات أثناء المعالجة
    isProcessing = true;
    userInput.disabled = true;
    sendButton.disabled = true;

    // إضافة رسالة المستخدم للشات
    addMessageToChat("user", message);

    // تنظيف الحقل
    userInput.value = "";
    userInput.style.height = "auto";

    // إظهار مؤشر الكتابة
    typingIndicator.classList.add("visible");

    // تحديث السجل
    chatHistory.push({ role: "user", content: message });

    try {
        // إنشاء عنصر لرسالة المساعد (فارغ في البداية)
        const assistantMessageEl = document.createElement("div");
        assistantMessageEl.className = "message assistant-message";
        assistantMessageEl.innerHTML = "<p></p>";
        chatMessages.appendChild(assistantMessageEl);
        
        // التقاط عنصر النص داخل الرسالة
        const assistantTextEl = assistantMessageEl.querySelector("p") as HTMLParagraphElement;

        // التمرير للأسفل
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // إرسال الطلب للـ API
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages: chatHistory,
            }),
        });

        // التعامل مع أخطاء الشبكة
        if (!response.ok) {
            throw new Error("Failed to get response");
        }
        if (!response.body) {
            throw new Error("Response body is null");
        }

        // إعداد قارئ الـ Stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let responseText = "";
        let buffer = "";

        // دالة مساعدة لتحديث النص في الواجهة
        const flushAssistantText = () => {
            assistantTextEl.textContent = responseText;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        let sawDone = false;

        // حلقة قراءة الـ Stream
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                // معالجة ما تبقى في الـ Buffer
                const parsed = consumeSseEvents(buffer + "\n\n");
                processEvents(parsed.events);
                break;
            }

            // فك تشفير البيانات القادمة
            buffer += decoder.decode(value, { stream: true });
            const parsed = consumeSseEvents(buffer);
            buffer = parsed.buffer;
            
            if (processEvents(parsed.events)) {
                sawDone = true;
                break;
            }
        }

        // إضافة الرد النهائي للسجل
        if (responseText.length > 0) {
            chatHistory.push({ role: "assistant", content: responseText });
        }

        /**
         * دالة داخلية لمعالجة الأحداث المستخرجة
         * تعيد true إذا تم الانتهاء
         */
        function processEvents(events: string[]): boolean {
            for (const data of events) {
                if (data === "[DONE]") {
                    return true;
                }
                try {
                    const jsonData: WorkerAIResponse = JSON.parse(data);
                    
                    // دعم الصيغتين: Workers AI و OpenAI Compatible
                    let content = "";
                    if (jsonData.response && jsonData.response.length > 0) {
                        content = jsonData.response;
                    } else if (jsonData.choices?.[0]?.delta?.content) {
                        content = jsonData.choices[0].delta.content;
                    }

                    if (content) {
                        responseText += content;
                        flushAssistantText();
                    }
                } catch (e) {
                    console.error("Error parsing SSE data as JSON:", e, data);
                }
            }
            return false;
        }

    } catch (error) {
        console.error("Error:", error);
        addMessageToChat(
            "assistant",
            "Sorry, there was an error processing your request."
        );
    } finally {
        // إعادة تفعيل الواجهة
        typingIndicator.classList.remove("visible");
        isProcessing = false;
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
    }
}

/**
 * دالة مساعدة لإضافة رسالة للواجهة
 */
function addMessageToChat(role: 'user' | 'assistant', content: string): void {
    const messageEl = document.createElement("div");
    messageEl.className = `message ${role}-message`;
    // ملاحظة: في بيئة الإنتاج يفضل استخدام textContent للحماية من XSS
    // ولكن هنا نستخدم innerHTML للسماح بتنسيق بسيط إذا لزم الأمر
    messageEl.innerHTML = `<p>${escapeHtml(content)}</p>`;
    chatMessages.appendChild(messageEl);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * معالجة Server-Sent Events (SSE)
 */
function consumeSseEvents(buffer: string): SSEResult {
    let normalized = buffer.replace(/\r/g, "");
    const events: string[] = [];
    let eventEndIndex: number;

    while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
        const rawEvent = normalized.slice(0, eventEndIndex);
        normalized = normalized.slice(eventEndIndex + 2);

        const lines = rawEvent.split("\n");
        const dataLines: string[] = [];
        
        for (const line of lines) {
            if (line.startsWith("data:")) {
                dataLines.push(line.slice("data:".length).trimStart());
            }
        }
        
        if (dataLines.length === 0) continue;
        events.push(dataLines.join("\n"));
    }
    return { events, buffer: normalized };
}

// دالة حماية بسيطة (اختياري)
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
	chatHistory.push({ role: "user", content: message });

	try {
		// Create new assistant response element
		const assistantMessageEl = document.createElement("div");
		assistantMessageEl.className = "message assistant-message";
		assistantMessageEl.innerHTML = "<p></p>";
		chatMessages.appendChild(assistantMessageEl);
		const assistantTextEl = assistantMessageEl.querySelector("p");

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;

		// Send request to API
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
			}),
		});

		// Handle errors
		if (!response.ok) {
			throw new Error("Failed to get response");
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		// Process streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let buffer = "";
		const flushAssistantText = () => {
			assistantTextEl.textContent = responseText;
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				// Process any remaining complete events in buffer
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					if (data === "[DONE]") {
						break;
					}
					try {
						const jsonData = JSON.parse(data);
						// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
						let content = "";
						if (
							typeof jsonData.response === "string" &&
							jsonData.response.length > 0
						) {
							content = jsonData.response;
						} else if (jsonData.choices?.[0]?.delta?.content) {
							content = jsonData.choices[0].delta.content;
						}
						if (content) {
							responseText += content;
							flushAssistantText();
						}
					} catch (e) {
						console.error("Error parsing SSE data as JSON:", e, data);
					}
				}
				break;
			}

			// Decode chunk
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}
				try {
					const jsonData = JSON.parse(data);
					// Handle both Workers AI format (response) and OpenAI format (choices[0].delta.content)
					let content = "";
					if (
						typeof jsonData.response === "string" &&
						jsonData.response.length > 0
					) {
						content = jsonData.response;
					} else if (jsonData.choices?.[0]?.delta?.content) {
						content = jsonData.choices[0].delta.content;
					}
					if (content) {
						responseText += content;
						flushAssistantText();
					}
				} catch (e) {
					console.error("Error parsing SSE data as JSON:", e, data);
				}
			}
			if (sawDone) {
				break;
			}
		}

		// Add completed response to chat history
		if (responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseText });
		}
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Sorry, there was an error processing your request.",
		);
	} finally {
		// Hide typing indicator
		typingIndicator.classList.remove("visible");

		// Re-enable input
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	messageEl.innerHTML = `<p>${content}</p>`;
	chatMessages.appendChild(messageEl);

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}
