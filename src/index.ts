/**
 * Astra AI - Backend Worker
 * نظام متكامل يدعم البث المباشر (Streaming) واختيار النماذج.
 */
import { Env, ChatMessage } from "./types";

// تعريف النماذج المتاحة وربطها بموديلات Cloudflare
const MODELS = {
	"astra-2.5": "@cf/meta/llama-3.1-8b-instruct-fp8", // نموذج سريع وخفيف
	"astra-3.0-pro": "@cf/meta/llama-3.1-70b-instruct-awq" // نموذج قوي واحترافي
};

const SYSTEM_PROMPT = "Your name is Astra AI. You are a professional and helpful assistant.";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// 1. التعامل مع الملفات الثابتة (Frontend & Assets)
		// هذا الجزء يضمن عدم تداخل الكود مع الواجهة
		if (!url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// 2. مسارات الـ API
		if (url.pathname === "/api/chat") {
			if (request.method !== "POST") {
				return new Response("Method not allowed", { status: 405 });
			}
			return handleChatRequest(request, env);
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * معالجة طلبات الدردشة ودعم النماذج المتعددة
 */
async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		// استقبال البيانات من الواجهة (بما في ذلك الموديل المختار)
		const { messages = [], model = "astra-2.5" } = (await request.json()) as {
			messages: ChatMessage[];
			model: string;
		};

		// تحديد الموديل المطلوب بناءً على القيمة القادمة من الواجهة
		const selectedModelId = MODELS[model as keyof typeof MODELS] || MODELS["astra-2.5"];

		// إعداد سجل الرسائل مع إضافة System Prompt إذا لم يوجد
		const chatMessages: ChatMessage[] = [...messages];
		if (!chatMessages.some(m => m.role === 'system')) {
			chatMessages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		// استدعاء Workers AI مع تفعيل خاصية الـ Stream
		const response = await env.AI.run(selectedModelId, {
			messages: chatMessages,
			stream: true,
		});

		// إعادة الرد كـ Server-Sent Events (SSE)
		return new Response(response as ReadableStream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				"Connection": "keep-alive",
			},
		});

	} catch (error: any) {
		console.error("Astra AI Backend Error:", error);
		return new Response(
			JSON.stringify({ error: "Internal Server Error", details: error.message }),
			{ status: 500, headers: { "Content-Type": "application/json" } }
		);
	}
}
