<template>
  <v-app>
    <template>
      <NuxtPage />
    </template>
    <div>
      <div class="d-flex flex-row">
        <v-tabs direction="vertical" v-model="tab">
          <v-tab>
            <v-icon left> mdi-function-variant </v-icon>
            Expression
          </v-tab>
          <v-tab>
            <v-icon left> mdi-clipboard-text-outline </v-icon>
            Resource
          </v-tab>
          <v-tab>
            <v-icon left> mdi-application-variable-outline </v-icon>
            Variables
          </v-tab>
          <v-tab>
            <v-icon left> mdi-format-list-bulleted </v-icon>
            Trace
          </v-tab>
          <v-tab>
            <v-icon left> mdi-bug-outline </v-icon>
            Debug
          </v-tab>
          <v-tab>
            <v-icon left> mdi-file-tree </v-icon>
            AST
          </v-tab>
          <v-tab>
            <v-icon left> mdi-brain </v-icon>
            Chat
          </v-tab>
        </v-tabs>

        <v-window v-model="tab" style="height: calc(100vh - 168px)">
          <v-window-item
            :eager="true"
            style="height: calc(100vh - 168px); overflow-y: auto"
          >
            <!-- Expression -->
            <v-card flat>
              <v-card-text>
                <p class="fl-tab-header">Expression</p>
                <v-textarea
                  v-model="expression"
                  label="Expression"
                  hide-details="auto"
                  rows="3"></v-textarea>
                  <v-btn @click="evaluateExpression">Evaluate</v-btn>
                <label class="v-label theme--light bare-label"
                  >Context Expression (optional)</label
                >
                <!-- <v-input label="Context Expression (optional)" hide-details="auto" :value="contextExpression">
                      </v-input> -->
                <div
                  height="85px"
                  width="100%"
                  ref="aceEditorContextExpression"
                ></div>
                <div class="ace_editor_footer"></div>

                <label class="v-label theme--light bare-label"
                  >Fhirpath Expression</label
                >
                <div height="85px" width="100%" ref="aceEditorExpression"></div>
                <div class="ace_editor_footer"></div>

                <div class="results">
                  RESULTS
                  <span class="processedBy">{{ processedByEngine }}</span>
                  <template v-for="(result, index) in results" :key="index">
                    <v-card  flat>
                      <v-card-text>
                        <pre>{{ result }}</pre>
                      </v-card-text>
                    </v-card>
                  </template>
                </div>
              </v-card-text>
            </v-card>
          </v-window-item>

          <v-window-item :eager="true">
            <!-- Resource -->
            <v-card flat>
              <v-card-text>
                <p class="fl-tab-header">Resource</p>
              </v-card-text>
            </v-card>
          </v-window-item>

          <v-window-item style="height: calc(100vh - 168px); overflow-y: auto">
            <!-- Variables -->
            <v-card flat>
              <v-card-text>
                <p class="fl-tab-header">Variables</p>
                <br />
                <label
                  ><i
                    >Note: This variables tab is only visible when there are
                    variables in the expression. To add another variable, name
                    it in the fhirpath expression.<br />
                    Also note that the variables are not supported in the
                    context expression.</i
                  ></label
                >
              </v-card-text>
            </v-card>
          </v-window-item>

          <v-window-item style="height: calc(100vh - 168px); overflow-y: auto">
            <!-- Trace -->
            <v-card flat>
              <v-card-text>
                <p class="fl-tab-header">Trace</p>
              </v-card-text>
            </v-card>
          </v-window-item>

          <v-window-item :eager="true">
            <!-- Debug -->
            <v-card flat>
              <v-card-text>
                <p class="fl-tab-header">Debug</p>
                <div
                  style="height: calc(100vh - 196px)"
                  ref="aceEditorDebug"
                ></div>
              </v-card-text>
            </v-card>
          </v-window-item>

          <v-window-item :eager="true">
            <!-- AST abstract syntax tree -->
            <v-card flat>
              <v-card-text>
                <p class="fl-tab-header">AST</p>
              </v-card-text>
            </v-card>
          </v-window-item>
        </v-window>
      </div>
    </div>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { evaluateFhirpathAsync } from "~/utils/fhirpath-async";
import type { } from "fhir/r4b";

// reactive state
const count = ref(0);

const processedByEngine = ref("demo app");

const results = ref([]);

const resourceJson = ref(JSON.stringify({
    resourceType: "Patient",
    name: [
      {
        given: ["John", "Doe"],
      },
    ],
    maritalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
          code: "M",
          display: "Married",
        },
      ],
    },
  }));
const expression = ref("Patient.name.given | maritalStatus | maritalStatus.coding.memberOf('http://hl7.org/fhir/ValueSet/observation-vitalsignresult')");

// functions that mutate state and trigger updates
function increment() {
  count.value++;
}

async function evaluateExpression() {
  console.log("Evaluating expression: " + expression.value);

  let fhirData: fhir4b.DomainResource = { resourceType: "Patient" }; // some dummy data
  if (resourceJson) {
    try {
      fhirData = JSON.parse(resourceJson.value);
    } catch (err: any) {
      console.log(err);
      if (err.message) {
        throw CreateOperationOutcome("fatal", "exception", err.message);
      }
    }
  }

  let result = await evaluateFhirpathAsync(
    fhirData,
    expression.value
  );
  console.log(result);
  results.value = result;
}

// lifecycle hooks
onMounted(() => {
  console.log(`The initial count is ${count.value}.`);
});
</script>
<script lang="ts">
export default {
  data() {
    return {
      tab: null,
      text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
      result: []
    };
  },
};
</script>utils/fhirpath-async