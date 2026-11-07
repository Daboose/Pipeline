/* eslint-disable no-unused-expressions, no-unused-vars -- an Aura controller is an object literal whose handlers take (component, event, helper) */
({
  // The LWC fires 'done' when the rep presses Done.
  handleDone: function (component, event, helper) {
    $A.get("e.force:closeQuickAction").fire();
  }
});
