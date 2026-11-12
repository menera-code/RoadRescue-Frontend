<script setup>
import { computed } from 'vue'
import { getIncidentLabel } from '@/utils/incidentTypes'

const props = defineProps({
  ml: { type: Object, default: null },
  reportedType: { type: String, default: '' },
  audience: { type: String, default: 'responder' },
})

const hasResult = computed(() => !!props.ml && Object.keys(props.ml).length > 0)
const confidence = computed(() => {
  const value = Number(props.ml?.confidence)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value * 100))) : null
})
const severity = computed(() => String(props.ml?.predictedSeverity || '').toLowerCase())
const severityClass = computed(() => ['low', 'medium', 'high', 'critical'].includes(severity.value) ? severity.value : 'unknown')
const predictedLabel = computed(() => props.ml?.predictedType ? getIncidentLabel(props.ml.predictedType) : 'Not available')
const reportedLabel = computed(() => props.reportedType ? getIncidentLabel(props.reportedType) : '')
const reviewRequired = computed(() => props.ml?.needsHumanReview === true || props.ml?.reportedTypeMatches === false)
const keywords = computed(() => Array.isArray(props.ml?.keywords) ? props.ml.keywords.filter(Boolean).slice(0, 5) : [])
const vehicles = computed(() => {
  const values = Array.isArray(props.ml?.allVehicles) ? props.ml.allVehicles : Object.keys(props.ml?.vehicles || {})
  return values.filter(Boolean).slice(0, 8)
})
const observations = computed(() => {
  const image = props.ml?.imageAnalysis?.observations
  const text = props.ml?.textAnalysis?.visual_observations
  const video = props.ml?.videoAnalysis?.observations
  const list = [...(Array.isArray(image) ? image : []), ...(Array.isArray(text) ? text : []), ...(Array.isArray(video) ? video : [])]
  return [...new Set(list.filter(item => typeof item === 'string' && item.trim()))].slice(0, 5)
})
const imageStatus = computed(() => {
  const image = props.ml?.imageAnalysis
  if (!image) return ''
  if (image.images_analyzed > 0) return `${image.images_analyzed} photo${image.images_analyzed === 1 ? '' : 's'} analyzed`
  if (image.images_received > 0) return 'Photo received, analysis unavailable'
  return ''
})
const videoStatus = computed(() => {
  const video = props.ml?.videoAnalysis
  if (!video?.video_received) return ''
  return video.video_analyzed ? 'Video analyzed' : 'Video received, analysis unavailable'
})
const statusLabel = computed(() => {
  const status = props.ml?.analysisStatus
  if (status === 'failed') return 'Analysis failed'
  if (status === 'completed_with_fallback') return 'Basic fallback assessment'
  if (status?.startsWith('completed')) return 'Analysis completed'
  return status ? String(status).replaceAll('_', ' ') : 'Assessment available'
})
</script>

<template>
  <section v-if="hasResult" class="ai-assessment" :class="`ai-assessment--${audience}`" aria-label="AI-assisted incident assessment">
    <div class="ai-head">
      <div>
        <p class="ai-eyebrow">Gemini AI assessment</p>
        <p class="ai-caption">{{ statusLabel }}</p>
      </div>
      <span class="ai-pill" :class="{ 'ai-pill--review': reviewRequired }">
        {{ reviewRequired ? 'Needs verification' : 'AI-assisted' }}
      </span>
    </div>

    <div v-if="ml.analysisStatus === 'failed'" class="ai-warning">
      AI analysis could not be completed. Use the original report and media for assessment.
    </div>
    <template v-else>
      <div class="ai-summary">
        <div class="ai-stat">
          <span class="ai-label">Predicted incident</span>
          <strong>{{ predictedLabel }}</strong>
          <small v-if="reportedLabel && ml.reportedTypeMatches === false">Citizen selected: {{ reportedLabel }}</small>
        </div>
        <div class="ai-stat">
          <span class="ai-label">Estimated severity</span>
          <strong class="severity" :class="`severity--${severityClass}`">{{ severity || 'Not available' }}</strong>
          <small v-if="confidence !== null">Model confidence estimate: {{ confidence }}%</small>
        </div>
      </div>

      <div v-if="reviewRequired" class="ai-warning">
        {{ ml.reportedTypeMatches === false ? 'The AI prediction differs from the citizen-selected category.' : 'Please verify the severity and evidence before acting.' }}
      </div>

      <div v-if="keywords.length" class="ai-section">
        <span class="ai-label">Report keywords</span>
        <div class="ai-chips"><span v-for="word in keywords" :key="word">{{ word }}</span></div>
      </div>

      <div v-if="vehicles.length" class="ai-section">
        <span class="ai-label">Vehicles identified or mentioned</span>
        <div class="ai-chips"><span v-for="vehicle in vehicles" :key="vehicle">{{ vehicle.replaceAll('_', ' ') }}</span></div>
      </div>

      <div v-if="observations.length" class="ai-section">
        <span class="ai-label">Media observations</span>
        <ul class="ai-observations"><li v-for="(item, index) in observations" :key="index">{{ item }}</li></ul>
      </div>

      <div v-if="imageStatus || videoStatus" class="ai-media">
        <span v-if="imageStatus">📷 {{ imageStatus }}</span>
        <span v-if="videoStatus">🎥 {{ videoStatus }}</span>
      </div>
    </template>

    <p class="ai-disclaimer">AI-generated assistance only. This is not a confirmed diagnosis or final incident determination. A responder or authorized administrator must verify the report.</p>
  </section>
</template>

<style scoped>
.ai-assessment{margin:12px 0;padding:14px;border:1px solid rgba(56,189,248,.28);border-radius:14px;background:rgba(14,165,233,.055);color:var(--text,#eaf0fa)}
.ai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
.ai-eyebrow{font-size:.78rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--primary-light,#38bdf8)}
.ai-caption{margin-top:3px;font-size:.72rem;color:var(--text-muted,#94a3b8);text-transform:capitalize}
.ai-pill{flex-shrink:0;padding:4px 8px;border-radius:99px;background:rgba(14,165,233,.13);color:#38bdf8;font-size:.66rem;font-weight:750}
.ai-pill--review{background:rgba(245,158,11,.14);color:#fbbf24}
.ai-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.ai-stat{min-width:0;padding:10px;border-radius:10px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}
.ai-label{display:block;margin-bottom:5px;color:var(--text-muted,#94a3b8);font-size:.66rem;font-weight:750;letter-spacing:.05em;text-transform:uppercase}
.ai-stat strong{display:block;font-size:.9rem;text-transform:capitalize;overflow-wrap:anywhere}
.ai-stat small{display:block;margin-top:4px;color:var(--text-muted,#94a3b8);font-size:.68rem;line-height:1.4}
.severity--low{color:#34d399}.severity--medium{color:#fbbf24}.severity--high{color:#fb923c}.severity--critical{color:#f87171}.severity--unknown{color:var(--text-muted,#94a3b8)}
.ai-warning{margin-top:10px;padding:9px 10px;border:1px solid rgba(245,158,11,.25);border-radius:9px;background:rgba(245,158,11,.08);color:#fbbf24;font-size:.75rem;line-height:1.45}
.ai-section{margin-top:12px}
.ai-chips{display:flex;flex-wrap:wrap;gap:6px}
.ai-chips span{padding:4px 8px;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:rgba(255,255,255,.045);font-size:.7rem;text-transform:capitalize}
.ai-observations{margin:0;padding-left:18px;color:var(--text,#eaf0fa);font-size:.76rem;line-height:1.5}
.ai-observations li+li{margin-top:4px}
.ai-media{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.ai-media span{font-size:.7rem;color:var(--text-muted,#94a3b8)}
.ai-disclaimer{margin-top:12px;padding-top:9px;border-top:1px solid rgba(255,255,255,.08);color:var(--text-muted,#94a3b8);font-size:.65rem;line-height:1.45}
.ai-assessment--citizen .ai-summary{grid-template-columns:1fr 1fr}
@media(max-width:380px){.ai-summary{grid-template-columns:1fr}}
</style>
