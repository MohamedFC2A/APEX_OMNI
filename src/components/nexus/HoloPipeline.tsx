// ... existing code ...
// نماذج DeepSeek الرسمية فقط
const OFFICIAL_MODELS = {
  'deepseek-chat': {
    name: 'Nexus Pro Engine',
    badge: 'bg-gradient-to-r from-blue-500 to-cyan-500',
    icon: '🤖'
  },
  'deepseek-reasoner': {
    name: 'Nexus Pro R1 (Reasoner)',
    badge: 'bg-gradient-to-r from-purple-500 to-pink-500',
    icon: '🧠'
  }
};

// إزالة أي إشارات لـ Llama أو Qwen نهائياً
const ModelBadge = ({ modelType }: { modelType: keyof typeof OFFICIAL_MODELS }) => {
  const model = OFFICIAL_MODELS[modelType];
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${model.badge} text-white`}>
      <span>{model.icon}</span>
      <span>{model.name}</span>
    </div>
  );
};
// ... existing code ...