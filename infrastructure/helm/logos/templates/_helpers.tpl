{{/*
Expand the name of the chart.
*/}}
{{- define "logos.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "logos.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "logos.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "logos.labels" -}}
helm.sh/chart: {{ include "logos.chart" . }}
{{ include "logos.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: logos
{{- end }}

{{/*
Selector labels
*/}}
{{- define "logos.selectorLabels" -}}
app.kubernetes.io/name: {{ include "logos.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "logos.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "logos.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create component-specific labels
*/}}
{{- define "logos.componentLabels" -}}
{{ include "logos.labels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Create component-specific selector labels
*/}}
{{- define "logos.componentSelectorLabels" -}}
{{ include "logos.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
PostgreSQL host
*/}}
{{- define "logos.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "logos.fullname" .) }}
{{- else }}
{{- .Values.externalPostgresql.host }}
{{- end }}
{{- end }}

{{/*
Redis host
*/}}
{{- define "logos.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" (include "logos.fullname" .) }}
{{- else }}
{{- .Values.externalRedis.host }}
{{- end }}
{{- end }}

