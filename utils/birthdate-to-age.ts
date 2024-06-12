// Simple, very specific function to convert a birthdate string to an age number
// This is a part of my learning exercise to understand how to add custom functions to fhirpath.js

export function birthdateToAge(birthDate: string) {
  if (!isValidDateString(birthDate)) {
    return undefined
  }

  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();

  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}


function isValidDateString(dateString: string) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  const timestamp = date.getTime();

  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return false;
  }

  return dateString === date.toISOString().split('T')[0];
}
