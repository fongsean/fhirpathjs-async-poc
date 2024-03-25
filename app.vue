<template>
  <v-app>
    <div>
      <!-- Expression -->
      <v-card flat>
        <v-card-text>
          <v-textarea
            :auto-grow="true"
            :loading="evaluating"
            v-model="expression"
            label="Expression"
            hide-details="auto"
            rows="3"
          ></v-textarea>
          <v-btn @click="evaluateExpression">Evaluate</v-btn>
          <v-progress-circular class="pb" indeterminate v-if="evaluating"></v-progress-circular>
          <v-textarea
            v-model="resourceJson"
            label="Resource JSON"
            hide-details="auto"
            rows="10"
          />

          <div class="results" v-if="results.length > 0">
            RESULTS
            <template v-for="(result, index) in results" :key="index">
              <v-card flat>
                <v-card-text>
                  <pre>{{ result }}</pre>
                </v-card-text>
              </v-card>
            </template>
          </div>
          <div class="results" v-if="outcome.issue.length > 0">
            ISSUES
            <template v-for="(result, index) in outcome.issue" :key="index">
              <v-card flat>
                <v-card-text>
                  <pre class="issue">{{ result }}</pre>
                </v-card-text>
              </v-card>
            </template>
          </div>
        </v-card-text>
      </v-card>
    </div>
  </v-app>
</template>

<style scoped>
.pb {
  margin-left: 10px;
}

.results {
  margin-top: 10px;
}
.issue {
  white-space: pre-wrap;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { evaluateFhirpathAsync } from "~/utils/fhirpath-async";
import type { OperationOutcome, Patient } from "fhir/r4b";
import fhirpath_r4_model from "fhirpath/fhir-context/r4";

// reactive state
const evaluating = ref(false);
const results = ref<any[]>([]);
const outcome = ref<OperationOutcome>({
  resourceType: "OperationOutcome",
  issue: [],
});
const resourceJson = ref(
  JSON.stringify(
    {
      resourceType: "Patient",
      name: [
        {
          given: ["John", "Doe"],
        },
      ],
      managingOrganization: {
        reference:
          "https://sqlonfhir-r4.azurewebsites.net/fhir/Organization/example",
      },
      maritalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
            code: "M",
            display: "Married",
          },
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
            code: "W",
            display: "Widowed",
          },
        ],
      },
    },
    null,
    2
  )
);
const expression = ref(
  "managingOrganization.resolve().select(name|alias)\n| maritalStatus.memberOf('http://hl7.org/fhir/ValueSet/observation-vitalsignresult')\n| maritalStatus.coding.memberOf('http://hl7.org/fhir/ValueSet/marital-status')"
);

// functions that mutate state and trigger updates
async function evaluateExpression() {
  console.log("Evaluating expression: " + expression.value);
  evaluating.value = true;

  let fhirData: fhir4b.DomainResource = { resourceType: "Patient" }; // some dummy data
  if (resourceJson) {
    try {
      fhirData = JSON.parse(resourceJson.value);
    } catch (err: any) {
      console.log(err);
      evaluating.value = false;
      if (err.message) {
        throw CreateOperationOutcome("fatal", "exception", err.message);
      }
    }
  }

  // run the actual fhirpath engine
  var context: Record<string, any> = {
    resource: fhirData,
    rootResource: fhirData,
  };

  try {
    let result = await evaluateFhirpathAsync(
      fhirData,
      expression.value,
      context,
      fhirpath_r4_model
    );
    console.log(result);
    results.value = result;
  } catch (err) {
    console.log(err);
    results.value = [];
    let oc = err as OperationOutcome;
    if (oc) {
      outcome.value.issue = oc.issue;
    }
  }
  evaluating.value = false;
}

// lifecycle hooks
onMounted(async () => {
  await evaluateExpression();
});
</script>
