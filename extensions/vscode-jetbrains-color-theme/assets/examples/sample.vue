<template>
  <div class="counter">
    <button @click="increment">Count: {{ count }}</button>
    <ChildComponent :message="greeting" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const count = ref(0)
const increment = () => count.value++

const greeting = computed(() => `Count is ${count.value}`)
</script>

<style scoped>
.counter {
  padding: 1rem;
}
</style>
