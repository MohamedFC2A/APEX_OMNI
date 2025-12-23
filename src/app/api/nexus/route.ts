// ... existing code ...
export async function POST(request: NextRequest) {
  const { prompt, mode } = await request.json();
  
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const writer = controller.getWriter();
      
      const STEPS = [
        { step: 1, label: "🚀 تهيئة محرك Nexus Pro" },
        { step: 2, label: "🔍 تحليل سياق المشكلة" },
        { step: 3, label: "📐 إنشاء مخطط هندسي" },
        { step: 4, label: "⚙️ تكوين المعلمات الأولية" },
        { step: 5, label: "🧠 تحميل نماذج الذكاء الاصطناعي" },
        { step: 6, label: "🔄 معايرة الأنظمة الفرعية" },
        { step: 7, label: "📊 جمع البيانات الأولية" },
        { step: 8, label: "🔧 إعداد بيئة التنفيذ" },
        { step: 9, label: "🎯 تحديد الأهداف الرئيسية" },
        { step: 10, label: "💾 تحميل المكتبات الأساسية" },
        { step: 11, label: "🛡️ تفعيل طبقات الأمان" },
        { step: 12, label: "⚡ تحسين الأداء" },
        { step: 13, label: "🔗 ربط المكونات" },
        { step: 14, label: "🧪 اختبار الوظائف" },
        { step: 15, label: "📈 تحليل الكفاءة" },
        { step: 16, label: "🎨 تصميم الواجهة" },
        { step: 17, label: "🔄 معالجة البيانات" },
        { step: 18, label: "🤖 توليد الشيفرة" },
        { step: 19, label: "🔎 مراجعة الجودة" },
        { step: 20, label: "🛠️ تصحيح الأخطاء" },
        { step: 21, label: "🚀 تحسين السرعة" },
        { step: 22, label: "📱 تحسين التجربة" },
        { step: 23, label: "🔐 تعزيز الأمان" },
        { step: 24, label: "💡 إضافة المميزات" },
        { step: 25, label: "📋 توثيق الشيفرة" },
        { step: 26, label: "🧼 تنظيف الشيفرة" },
        { step: 27, label: "⚖️ معايرة الموازنات" },
        { step: 28, label: "🎯 اختبار النهائي" },
        { step: 29, label: "📦 تجهيز الناتج" },
        { step: 30, label: "✅ إنهاء الحل Nexus-tier" }
      ];
      
      for (const { step, label } of STEPS) {
        console.log(`[NEXUS] Step ${step}: ${label}`);
        
        writer.write(encoder.encode(
          `data: ${JSON.stringify({ step, status: "active", label })}\n\n`
        ));
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const model = mode === 'super-coder' ? 'deepseek-reasoner' : 'deepseek-chat';
      const apiUrl = 'https://api.deepseek.com/chat/completions';
      
      const body: any = {
        model,
        messages: [
          { role: "system", content: "You are Nexus Pro 1.0. Provide expert solutions." },
          { role: "user", content: prompt }
        ],
        stream: true
      };
      
      if (model === 'deepseek-reasoner') {
        delete body.temperature;
        delete body.top_p;
      } else {
        body.temperature = 0.7;
        body.top_p = 0.9;
      }
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify(body)
      });
      
      const reader = response.body?.getReader();
      if (!reader) {
        writer.close();
        return;
      }
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
      }
      
      writer.close();
    }
  });
  
  return new NextResponse(stream);
}