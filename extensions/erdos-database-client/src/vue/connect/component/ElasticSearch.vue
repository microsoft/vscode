<template>
  <div class="mt-5">
    <section class="mb-2">
      <div class="inline-block mr-10">
        <label class="inline-block w-32 mr-5 font-bold">
          <span>URL</span>
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input
          class="field__input"
          style="width: 28rem"
          placeholder="The host of connection"
          required
          v-model="connectionOption.host"
        />
      </div>
    </section>
    <section class="mb-2">
      <label class="inline-block mr-5 font-bold w-36">Basic Auth(Optional)</label>
      <div class="inline-flex items-center">
        <el-radio v-model="connectionOption.esAuth" label="none">Not Auth</el-radio>
        <el-radio v-model="connectionOption.esAuth" label="account">Account</el-radio>
        <el-radio v-model="connectionOption.esAuth" label="token">Token</el-radio>
      </div>
    </section>
    <section v-if="connectionOption.esAuth == 'account'">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Username</label>
        <input class="w-64 field__input" placeholder="Username" required v-model="connectionOption.user" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Password</label>
        <input class="w-64 field__input" placeholder="Password" type="password" v-model="connectionOption.password" />
      </div>
    </section>
    <section class="inline-block mb-2 mr-10" v-if="connectionOption.esAuth == 'token'">
      <label class="inline-block w-32 mr-5 font-bold">Token</label>
      <input
        class="field__input"
        style="width: 40rem"
        placeholder="Basic Auth Token. e.g Bearer <token>"
        required
        v-model="connectionOption.esToken"
      />
    </section>
    <div class="inline-block mb-2 mr-10">
      <label class="inline-block w-32 mr-5 font-bold">Connection Timeout</label>
      <input class="w-64 field__input" placeholder="2000" required v-model="connectionOption.connectTimeout" />
    </div>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
};
</script>

<style></style>
