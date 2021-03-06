/**
@module ember
@submodule ember-routing-htmlbars
*/

import Ember from "ember-metal/core"; // assert, deprecate
import EmberError from "ember-metal/error";
import { camelize } from "ember-runtime/system/string";
import generateController from "ember-routing/system/generate_controller";
import {
  generateControllerFactory
} from "ember-routing/system/generate_controller";
import { isStream } from "ember-metal/streams/utils";
import mergeViewBindings from "ember-htmlbars/system/merge-view-bindings";
import appendTemplatedView from "ember-htmlbars/system/append-templated-view";

/**
  Calling ``{{render}}`` from within a template will insert another
  template that matches the provided name. The inserted template will
  access its properties on its own controller (rather than the controller
  of the parent template).

  If a view class with the same name exists, the view class also will be used.

  Note: A given controller may only be used *once* in your app in this manner.
  A singleton instance of the controller will be created for you.

  Example:

  ```javascript
  App.NavigationController = Ember.Controller.extend({
    who: "world"
  });
  ```

  ```handlebars
  <!-- navigation.hbs -->
  Hello, {{who}}.
  ```

  ```handlebars
  <!-- application.hbs -->
  <h1>My great app</h1>
  {{render "navigation"}}
  ```

  ```html
  <h1>My great app</h1>
  <div class='ember-view'>
    Hello, world.
  </div>
  ```

  Optionally you may provide a second argument: a property path
  that will be bound to the `model` property of the controller.

  If a `model` property path is specified, then a new instance of the
  controller will be created and `{{render}}` can be used multiple times
  with the same name.

 For example if you had this `author` template.

 ```handlebars
<div class="author">
Written by {{firstName}} {{lastName}}.
Total Posts: {{postCount}}
</div>
```

You could render it inside the `post` template using the `render` helper.

```handlebars
<div class="post">
<h1>{{title}}</h1>
<div>{{body}}</div>
{{render "author" author}}
</div>
 ```

  @method render
  @for Ember.Handlebars.helpers
  @param {String} name
  @param {Object?} context
  @param {Hash} options
  @return {String} HTML string
*/
export function renderHelper(params, hash, options, env) {
  var currentView = env.data.view;
  var container, router, controller, view, initialContext;

  var name = params[0];
  var context = params[1];

  container = currentView._keywords.controller.value().container;
  router = container.lookup('router:main');

  Ember.assert(
    "The first argument of {{render}} must be quoted, e.g. {{render \"sidebar\"}}.",
    typeof name === 'string'
  );

  Ember.assert(
    "The second argument of {{render}} must be a path, e.g. {{render \"post\" post}}.",
    params.length < 2 || isStream(params[1])
  );


  if (params.length === 1) {
    // use the singleton controller
    Ember.assert(
      "You can only use the {{render}} helper once without a model object as " +
      "its second argument, as in {{render \"post\" post}}.",
      !router || !router._lookupActiveView(name)
    );
  } else if (params.length === 2) {
    // create a new controller
    initialContext = context.value();
  } else {
    throw new EmberError("You must pass a templateName to render");
  }

  // # legacy namespace
  name = name.replace(/\//g, '.');
  // \ legacy slash as namespace support


  view = container.lookup('view:' + name) || container.lookup('view:default');

  // provide controller override
  var controllerName;
  var controllerFullName;

  if (hash.controller) {
    controllerName = hash.controller;
    controllerFullName = 'controller:' + controllerName;
    delete hash.controller;

    Ember.assert(
      "The controller name you supplied '" + controllerName + "' " +
      "did not resolve to a controller.",
      container._registry.has(controllerFullName)
    );
  } else {
    controllerName = name;
    controllerFullName = 'controller:' + controllerName;
  }

  var parentController = currentView._keywords.controller.value();

  // choose name
  if (params.length > 1) {
    var factory = container.lookupFactory(controllerFullName) ||
                  generateControllerFactory(container, controllerName, initialContext);

    controller = factory.create({
      modelBinding: context, // TODO: Use a StreamBinding
      parentController: parentController,
      target: parentController
    });

    view.one('willDestroyElement', function() {
      controller.destroy();
    });
  } else {
    controller = container.lookup(controllerFullName) ||
                 generateController(container, controllerName);

    controller.setProperties({
      target: parentController,
      parentController: parentController
    });
  }

  hash.viewName = camelize(name);

  var templateName = 'template:' + name;
  Ember.assert(
    "You used `{{render '" + name + "'}}`, but '" + name + "' can not be " +
    "found as either a template or a view.",
    container._registry.has("view:" + name) || container._registry.has(templateName) || !!options.template
  );
  var template = options.template || container.lookup(templateName);

  if (router && !initialContext) {
    router._connectActiveView(name, view);
  }

  var props = {
    template: template,
    controller: controller,
    helperName: 'render "' + name + '"'
  };

  mergeViewBindings(currentView, props, hash);
  appendTemplatedView(currentView, options.morph, view, props);
}
