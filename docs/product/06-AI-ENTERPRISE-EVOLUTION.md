# 06 — AI Stratejisi, Maintenance, Enterprise ve Sürüm Evrimi

## Temel ilke

**AI önkoşul değildir.** Kullanıcı niyeti typed schema ve onaylı mapping olarak saklanır. AI gelirse yalnızca test tasarımını önerir, aday uygulama modelini zenginleştirir veya başarısızlığı sınıflandırmaya yardımcı olur; **testin expected result'ını sessizce değiştiremez.**

## Üç otomasyon seviyesi

| Seviye | Nasıl çalışır | İlk sürüm kararı |
|---|---|---|
| Deterministic | role/label/testId sıralaması, schema validation, controlled intents, compile, execution | **MVP merkezinde** |
| AI-assisted | flow/selector önerisi, requirement → draft, failure summary, diff açıklaması | Ölçümlü V1/V2 |
| Autonomous | keşif, repair ve optimize operasyonlarını tek başına yayınlama | **MVP dışında**; yüksek riskli ve onay politikası gerekir |

## Kapasite roadmap'i ve kabul kapıları

1. **MVP:** manually reviewed app graph; reusable flows; deterministic selector fallback; explicit assertion.
2. **V1 intelligence (candidate):** deterministic app-model drift detection, impacted tests list, suggested locator remapping; kullanıcı kabul etmedikçe published model değişmez.
3. **V2 AI assist (candidate):** gereksinim metninden kontrollü test taslağı, keşif adaylarını etiketleme, failure triage önerisi; modelin ürettiği her öğe `unverified` statülü.
4. **V3 (candidate):** multi-step maintenance recommendation + risk scored regression selection; evidence and A/B evaluation.
5. **V4 (long-term):** agentic exploratory testing ve otomasyon üretme; allowlisted staging, kontrol mekanizması, audit ve düşük yanlış pozitif kabul eşiği doğrulanmışsa.

**Özel risk:** AI/healing, locator hatasını düzeltirken gerçek uygulama hatasını gizleyebilir; BrowserStack'in kendi AI healing dokümanı da bu riske dikkat çekiyor. Bu nedenle UI/iş kuralı assertion'ı korunur, repair sonrası test `needs_review` olarak işaretlenebilir.

## Self-healing policy

- **Tier 0 / deterministic:** same semantic element matches alternative stable locator; runtime denemesi loglanır.
- **Tier 1 / human review:** yeni element candidate çıkar; original vs proposed mapping screenshot/DOM/label diff + confidence gösterir.
- **Tier 2 / AI-assisted:** semantic/visual öneri; confidence threshold ve human approval; yeni AppModelRevision.
- **Tier 3 / automatic promotion:** **MVP yok**, yalnız kapsamlı falsification deneyleri, policy ve run replay sonrası düşünülebilir.

**Hard invariants:** Assertion expected değişmez; boolean `visible` ifadesi `present` gibi daha zayıf koşula dönüşmez; test PASS olduysa hangi locator candidate'ın kullanıldığı saklanır; healing sonucu yeni model revision oluşur; audit geriye dönük silinmez.

## Enterprise mimarisi — sırayla

**Başlangıç temeli:** Organization/Project ID, RBAC, audit, secrets references, tenant data isolation, artifact retention, private worker boundary ve açık maliyet metreleri. Bu konuların sonradan eklenmesi pahalı olduğundan MVP'de dar kapsamlı da olsa gereklidir.

**V1/V2:** SSO (OIDC/SAML), SCIM, projeler arası kontrollü flow/template paylaşımı, özel CI triggers, webhooks, egress policies, IP restrictions, approval workflows, project quotas ve encrypted backups.

**Satışla doğrulanırsa:** on-prem, enterprise private runner, customer-managed keys, LDAP, veri bölgesi, sözleşmesel SLA/compliance kanıtları. Gerçek sertifika/uyum sağlanmadan “SOC2 compliant” vb. iddia edilmez.

## Web → API → Mobile ilerleme koşulu

- **Web:** önce intent/element/flow modelinin bakımı ölçülebilir hale gelir.
- **API:** İkinci adapter ve typed request/assertion modelini eklemek için test modelinin stabilizasyonu gerekir; ayrı REST/OpenAPI spec ve secrets handling.
- **Mobile:** element semantiği, device capabilities, lifecycle, gestures, device provider maliyeti ve private network sorunlarını ayrı POC ile çöz. Web modeline zorla sığdırma.
- **Cross-platform business flow:** Ancak aynı “Login / Checkout” intent'inin adapter capabilities ile doğru semantiği koruduğu gösterilince.

## SaaS / Hybrid / On-prem seçenekleri

| Model | Artısı | Riski | Zamanlama |
|---|---|---|---|
| SaaS pilot | Hızlı onboarding / operasyon | şirket ağı ve veri gizliliği | MVP/pilot hipotezi |
| Hybrid private runner | Test verisi şirket ağında çalışabilir | agent lifecycle, auth, upgrade | V1+ pilot talebiyle |
| On-prem | Regülasyonlu müşteri için uygun olabilir | destek/kurulum/upgrade maliyeti | yalnız doğrulanmış satış fırsatı |

## Monetizasyon hipotezleri (fiyat rakamı karar değil)

- Creator seat + concurrent run cap; çok az editor ama yoğun executor kullanan ekiplerde adil olmayabilir.
- Proje + worker dakika kotası; ölçeklenebilir ancak cloud cost yönetimi şarttır.
- Enterprise private runner, SSO, audit retention, support tier add-on olabilir.
- Pilot görüşmelerinde `willingness-to-pay`, yıllık bütçe, procurement cycles ve tercih edilen fiyat metriği doğrudan ölçülecek.

## Sürekli maliyet raporu

`gross margin ≈ revenue − (worker CPU/RAM + artifact storage + traffic + AI API + operational support + enterprise custom deployment)`; rakamsal varsayımlar gerçek run telemetry ve pilot tekliflerinden toplanmadan yazılmamalı.
