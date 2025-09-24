import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAIProxyRequest = {
  prompt?: string;
  messages?: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  responseFormat?: { type: string } | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("call-openai-api function invoked");
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: OpenAIProxyRequest = await req.json();
    const { prompt, messages, model, temperature, maxTokens, topP, presencePenalty, frequencyPenalty, responseFormat } = body;

    if ((!prompt || typeof prompt !== "string") && (!messages || !Array.isArray(messages) || messages.length === 0)) {
      throw new Error("有効なプロンプトまたはメッセージがありません");
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("chatgpt");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const payload: Record<string, unknown> = {
      model: model || "gpt-4o-mini",
      messages: messages || [{ role: "user", content: prompt || "" }],
      temperature: typeof temperature === "number" ? temperature : 0.7,
      max_tokens: typeof maxTokens === "number" ? maxTokens : 4000,
    };

    if (typeof topP === "number") payload.top_p = topP;
    if (typeof presencePenalty === "number") payload.presence_penalty = presencePenalty;
    if (typeof frequencyPenalty === "number") payload.frequency_penalty = frequencyPenalty;
    if (responseFormat) payload.response_format = responseFormat;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ OpenAI API error:", response.status, response.statusText, errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const messageContent: string | undefined = result?.choices?.[0]?.message?.content;

    return new Response(
      JSON.stringify({
        success: true,
        content: messageContent ?? "",
        raw: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ call-openai-api error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
