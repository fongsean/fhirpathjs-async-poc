import type { CodeableConcept, Coding, OperationOutcome, OperationOutcomeIssue, Reference, Resource } from "fhir/r4b";
import fhirpath from "fhirpath";
import { logMessage, CreateOperationOutcome } from "~/utils/create-outcome";

// --------------------------------------------------------------------------
// The concept of this POC is to demonstrate an approach to perform some
// async based methods as functions inside the fhirpath engine without
// converting the entire engine to process things asynchronously.
// e.g. Terminology functions such as memberOf, subsumes, or resolve()
//
// The basic gist is:
// * Perform an initial evaluation in sync mode
// * when encountering any method that requires async execution
//    - queue the required call
//    - return a null result
//    - continue processing the rest of the expression.
// * If no async calls where encountered the result is returned immediately.
// * Process all the encountered async calls and stash the results.
// * Re-evaluate the expression from the start
//    - when encountering the async methods again, inject the resolved results and continue processing.
// If there were no additional async methods encountered, return the result.
// otherwise, repeat the process until all async calls are resolved.
// --------------------------------------------------------------------------
// Open question: Should the async requests have access to the other potential results?
// Reason: That would enable the result from one function to be accessed in another function.
// --------------------------------------------------------------------------

/** Global debug variable to permit the logger to write information messages
    to the OperationOutcome and console
*/
export var debugAsyncFhirpath: boolean = true;

/**
 * Evaluate a FHIRPath expression asynchronously
 * @param fhirData FHIR resource to run the FHIRPath expression against
 * @param path FHIRPath expression to evaluate (string or Path object)
 * @param context Environment to evaluate the expression in, mostly variables
 * @param model which fhir version to use (r4/r4b/r5)
 * @returns the result of the evaluation
 */
export async function evaluateFhirpathAsync(
  fhirData: fhir4b.DomainResource,
  path: string | Path,
  context?: Context,
  model?: Model,
): Promise<any[]> {
  let results = [];
  let debug = false;
  let outcome: OperationOutcome = {
    resourceType: "OperationOutcome",
    issue: []
  }

  let asyncCallsRequired: Map<string, AsyncFunctionUserData> = new Map<string, AsyncFunctionUserData>();
  let requiresAsyncProcessing = false;
  // introduce a custom function for resolve into the options
  // https://github.com/HL7/fhirpath.js/?tab=readme-ov-file#user-defined-functions
  // https://github.com/HL7/fhirpath.js/blob/5428ef8be766301658215ef7ed241c8a1666a980/index.d.ts#L86
  const userInvocationTable: UserInvocationTable = {
    resolve: {
      fn: (inputs: any[]) =>
        inputs.map((reference: string | Reference) => {
          let key = createIndexKeyResolve(reference);
          if (key) {
            key = "Resolve:" + key;
            if (asyncCallsRequired.get(key)?.evaluationCompleted) {
              logMessage(debugAsyncFhirpath, outcome, '  using cached result for: ', key);
              return asyncCallsRequired.get(key)?.result;
            }
            let details: ResolveUserData = {
              evaluationCompleted: false,
              asyncFunction: resolveAsync,
              value: reference
            };
            asyncCallsRequired.set(key, details);
            logMessage(debugAsyncFhirpath, outcome, '  requires async evaluation for: ', key);
            requiresAsyncProcessing = true;
          }
          return undefined;
        }),
      arity: { 0: [] },
    },
    memberOf: {
      fn: (inputs: any[], valueSet: string) =>
        inputs.map((codeData: string | Coding | CodeableConcept) => {
          let key = createIndexKeyMemberOf(codeData, valueSet);
          if (key) {
            key = "MemberOf:" + key;
            if (asyncCallsRequired.get(key)?.evaluationCompleted) {
              logMessage(debugAsyncFhirpath, outcome, '  using cached result for: ', key);
              return asyncCallsRequired.get(key)?.result;
            }
            let details: MemberOfUserData = {
              evaluationCompleted: false,
              asyncFunction: memberOfAsync,
              value: codeData,
              valueSet: valueSet,
            };
            asyncCallsRequired.set(key, details);
            logMessage(debugAsyncFhirpath, outcome, '  requires async evaluation for: ', key);
            requiresAsyncProcessing = true;
          }
          return undefined;
        }),
      arity: { 1: ["String"] },
    },
  };

  let options = {
    userInvocationTable: userInvocationTable,
  };

  let iterations = 0;
  do {
    iterations++;
    // Perform the async calls required (none first time in)
    if (asyncCallsRequired.size > 0) {
      // resolve the async calls
      for (let key of asyncCallsRequired.keys()) {
        let details = asyncCallsRequired.get(key);
        if (!details?.evaluationCompleted) {
          // perform the async call to check for the memberOf status
          logMessage(debugAsyncFhirpath, outcome, "  performing async request for: ", key);
          await details?.asyncFunction(details);
        }
      }
      requiresAsyncProcessing = false;
    }

    // Evaluate the expression
    logMessage(debugAsyncFhirpath, outcome, "performing iteration: ", iterations)
    try {
      results = fhirpath.evaluate(
        fhirData,
        path,
        context,
        model,
        options
      );
    } catch (err: any) {
      console.log(err);
      if (err.message) {
        throw CreateOperationOutcome("fatal", "exception", err.message);
      }
    }

  } while (requiresAsyncProcessing && iterations < 10); // bound the number of iterations
  if (iterations > 1) {
    logMessage(debugAsyncFhirpath, outcome, "total iterations", iterations);
  }
  console.log(outcome);
  return results;
}

interface AsyncFunctionUserData {
  evaluationCompleted: boolean;
  asyncFunction: (details: AsyncFunctionUserData) => Promise<void>;
  result?: any;
}

// --------------------------------------------------------------------------
// The following section is the custom function for resolve()
// --------------------------------------------------------------------------
interface ResolveUserData extends AsyncFunctionUserData {
  value: string | Reference;
}

/**
 * Create an Index Key for the memberOf function
 * @param value 
 * @returns 
 */
function createIndexKeyResolve(value: string | Reference): string | undefined {
  if (typeof value === "string") 
    return value;
  if (value as Reference)
    return (value as Reference).reference;
  return value;
}

/**
 * Perform the actual async member of evaluation
 * @param details parameters which is actually a MemberOfUserData structure
 */
async function resolveAsync(details: AsyncFunctionUserData): Promise<void> {
  // perform the async call to check for the memberOf status
  let typedData = details as ResolveUserData;
  details.evaluationCompleted = true;
  if (typedData.value === "http://hl7.org/fhir/ValueSet/observation-vitalsignresult")
    details.result = { resourceType: "Organization", id: "1234" };
  else
    details.result = undefined; // not found!
}


// --------------------------------------------------------------------------
// The following section is the custom function for memberOf()
// --------------------------------------------------------------------------
interface MemberOfUserData extends AsyncFunctionUserData {
  value: string | Coding | CodeableConcept;
  valueSet: string;
}

/**
 * Create an Index Key for the memberOf function
 * @param value 
 * @param valueset 
 * @returns 
 */
function createIndexKeyMemberOf(value: string | Coding | CodeableConcept, valueset: string): string | undefined {
  if (typeof value === "string") {
    return value + " - " + valueset;
  }
  let coding = value as Coding;
  if (coding.code) {
    return coding.system + "|" + coding.code + " - " + valueset;
  }
  let cc = value as CodeableConcept;
  if (cc.coding) {
    // return the same as for coding by joining each of the codings with a comma
    return cc.coding.map((c) => c.system + "|" + c.code).join(",") + " - " + valueset;
  }
  return undefined;
}

/**
 * Perform the actual async member of evaluation
 * @param details parameters which is actually a MemberOfUserData structure
 */
async function memberOfAsync(details: AsyncFunctionUserData): Promise<void> {
  // perform the async call to check for the memberOf status
  let typedData = details as MemberOfUserData;
  details.evaluationCompleted = true;
  if (typedData.valueSet === "http://hl7.org/fhir/ValueSet/observation-vitalsignresult")
    details.result = true;
  else
    details.result = false;
}
