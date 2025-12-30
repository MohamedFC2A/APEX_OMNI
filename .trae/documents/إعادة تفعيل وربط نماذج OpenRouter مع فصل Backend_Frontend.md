## التنفيذ المباشر حسب البرومبت الصارم

### المهام المطلوبة:
1. **إنشاء Model Registry** (`web/src/lib/modelRegistry.ts`) مع تعيينات:
   - `NEXUS_FLASH_PRO` → `xiaomi/mimo-v2-flash:free`
   - `NEXUS_THINKING_PRO` → قائمة 7 نماذج DEEP_THINKING
   - `NEXUS_APEX_OMENI` → قائمة 12 نموذج APEX

2. **تحديث nexusMeta.ts** لاستخدام الأسماء الداخلية الجديدة والاستفادة من الـ Registry

3. **تحديث route.ts** لاستخدام `resolveModelId` و `getModelsForMode` مع تطبيق سياسة التخطي الفوري

4. **تحديث nexusStore.ts** لدعم الأسماء الداخلية الجديدة وتنظيف النصوص المعروضة

5. **تحديث المكونات الأمامية** (ModePopover.tsx, AboutModal.tsx لم)طابقة الأسماء

6. **إضافة Circuit Breaker + Warm Token Cache** في الـ pipeline

7. **جعل NEX PLANUS LIVE مطويًا افتراضيًا** دون التأثير على التخطيط

8. **التحقق النهائي** من:
   -اء بق OpenRouter نشطًا بالكامل
   - جميع النماذج قابلة للاستدعاء ومختبرة
   - عدم ظهور أسماء نماذج خارجية في أي مكان
   - استقرار التخطيط على الجوال والكمبيوتر

### القيود الصارمة:
- ✅ لا حذف أو تعطيل لتكامل OpenRouter
- ✅ لا تعديل على model IDs الخلفية الحقيقية
- ✅ فصل تام بين الأسماء الأمامية والخلفية
- ✅ أي خطر على الـ backend → إيقاف فوري وتراجع