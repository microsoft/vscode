<template>
  <div class="mt-5">
    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block font-bold mr-9 w-28">
          SSH Host
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input class="w-64 field__input" placeholder="SSH Host" required v-model="connectionOption.ssh.host" />
      </div>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block font-bold mr-9 w-28">
          SSH Port
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input
          class="w-64 field__input"
          placeholder="SSH Port"
          required
          type="number"
          v-model="connectionOption.ssh.port"
        />
      </div>
    </section>

    <section>
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block font-bold mr-9 w-28">
          SSH Username
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input class="w-64 field__input" placeholder="SSH Username" required v-model="connectionOption.ssh.username" />
      </div>

      <div class="inline-block mb-2 mr-10">
        <label class="inline-block font-bold mr-9 w-28">SSH Cipher</label>
        <el-select v-model="connectionOption.ssh.algorithms.cipher[0]" placeholder="Default">
          <el-option value="aes128-cbc">aes128-cbc</el-option>
          <el-option value="aes192-cbc">aes192-cbc</el-option>
          <el-option value="aes256-cbc">aes256-cbc</el-option>
          <el-option value="3des-cbc">3des-cbc</el-option>
          <el-option value="aes128-ctr">aes128-ctr</el-option>
          <el-option value="aes192-ctr">aes192-ctr</el-option>
          <el-option value="aes256-ctr">aes256-ctr</el-option>
        </el-select>
      </div>
    </section>

    <section v-if="connectionOption.dbType == 'SSH'">
      <div class="inline-block mb-2 mr-10">
        <label class="inline-block w-32 mr-5 font-bold">Show Hidden File</label>
        <el-switch v-model="connectionOption.showHidden"></el-switch>
      </div>
    </section>

    <section class="mb-2">
      <label class="inline-block font-bold mr-9 w-28">Type</label>
      <el-radio v-model="connectionOption.ssh.type" label="password">Password</el-radio>
      <el-radio v-model="connectionOption.ssh.type" label="privateKey">Private Key</el-radio>
      <el-radio v-model="connectionOption.ssh.type" label="native">Native SSH</el-radio>
    </section>

    <div v-if="connectionOption.ssh.type == 'password'" class="mb-2">
      <section>
        <label class="inline-block font-bold mr-9 w-28">
          Password
          <span class="mr-1 text-red-600" title="required">*</span>
        </label>
        <input
          class="w-64 field__input"
          placeholder="Password"
          required
          type="password"
          v-model="connectionOption.ssh.password"
        />
      </section>
    </div>
    <div v-else class="mb-2">
      <section>
        <div class="inline-block mb-2 mr-8">
          <label class="inline-block font-bold mr-9 w-28">Private Key Path</label>
          <input
            class="w-50 field__input"
            placeholder="Private Key Path"
            v-model="connectionOption.ssh.privateKeyPath"
          />
          <button @click="() => $emit('choose')" type="button" class="w-12 ml-1">Choose</button>
        </div>
        <div class="inline-block mb-2 mr-10">
          <label class="inline-block font-bold mr-9 w-28">Passphrase</label>
          <input
            class="w-64 field__input"
            placeholder="Passphrase"
            type="password"
            v-model="connectionOption.ssh.passphrase"
          />
        </div>
      </section>
      <section v-if="connectionOption.ssh.type == 'native'">
        <div class="inline-block mr-10">
          <label class="inline-block font-bold mr-9 w-28">Waiting Time</label>
          <input
            class="w-64 field__input"
            placeholder="Waiting time for ssh command."
            v-model="connectionOption.ssh.watingTime"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script>
export default {
  props: ["connectionOption"],
};
</script>

<style></style>
