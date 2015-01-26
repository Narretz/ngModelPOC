describe('misc use cases', function() {

  var element, log, attrs, ngModelCtrl, inputController, scope;

  function logNgModelControllerEvent(ctrl, eventName) {
    ctrl[eventName].addHandler(function(newVal, oldVal) {
      log.push(eventName + ': from "' + oldVal + '" to "' + newVal + '"');
    });
  }

  function setup(initialScopeVal, initialInputValue, localOptions) {

    mockPromises.install(Q.makePromise);
    mockPromises.reset();

    var defaultLocalOptions = {
      adaptors: ['defaultAdaptor'],
      updateOn: 'change'
    };

    // Provide a default ngModelOptions object containing adaptors
    // This would be an Angular service, that can be modified in a config block
    var defaultNgModelOptions = new NgModelOptions(localOptions || defaultLocalOptions, null, null, $ngModelAdaptors);

    // Create a "scope"
    scope = new Scope({ value: initialScopeVal });

    // Create an "element" that would hold the ngModel, input, validation and transform directives
    element = new Element(initialInputValue);
    attrs = new Attributes({ ngModel: 'value' });

    // Simulate an ngModel directive
    ngModelDirective = NgModelDirective(defaultNgModelOptions);
    ngModelCtrl = new NgModelController(scope, element, attrs, $parse);
    // Run the ngModel prelink function
    ngModelDirective.link.pre(scope, element, attrs, [ngModelCtrl, null, null]);

    // We are assuming that the input directive is legacy and doesn't provide its own inputController
    // In this case the NgModelController provides a default InputController
    inputController = ngModelCtrl.$inputController;

    // Add some logging for tests
    logNgModelControllerEvent(ngModelCtrl, '$modelValueChanged');
    logNgModelControllerEvent(ngModelCtrl, '$parseView');
    logNgModelControllerEvent(ngModelCtrl, '$parseError');
    logNgModelControllerEvent(ngModelCtrl, '$formatModel');
    logNgModelControllerEvent(ngModelCtrl, '$formatError');
    logNgModelControllerEvent(ngModelCtrl, '$viewValueChanged');
  }

  function changeInput(value) {
    // Simulate a date selection
    element.val(value);
    element.trigger('change');
    $timeout.flush();
  }

  function changeScope(value) {
    scope.value = value;
    scope.$digest();
  }

  beforeEach(function() {
    element = null;
    log = [];
    ngModelCtrl = null;
    inputController = null;
    scope = null;
    attrs = null;
  });

  xdescribe('write to scope even if invalid', function() {

    //This fails because the writeToScopeIfValidAdapter sets the $modelValue / model to null
    //if validation is invalid. Because it is async, it is always set after writeToScopeIfInvalid
    it('should write to scope even if invalid', function() {

      setup(undefined, undefined, {adaptors: ['defaultAdaptor', 'writeToScopeIfInvalid'], updateOn: 'change'});

      ngModelCtrl.$validity.addValidator('test', function(value) {
        return false;
      });

      changeInput('value');

      // trigger async apply
      scope.$digest();

      expect(ngModelCtrl.$modelValue).toBe('value');
      expect(ngModelCtrl.$valid).toBe(true);
      expect(scope.value).toBe('value');

      expect(log).toEqual([
        '$parseView: from "undefined" to "value"',
        '$modelValueChanged: from "undefined" to "value"'
      ]);
    });
  });

  xdescribe('validating outside $setViewValue', function() {

    it('should set modelValue and scope to null and valid to false when validate is false', function() {

      setup(undefined, undefined, {adaptors: ['defaultAdaptor'], updateOn: 'change'});

      var valid = true;
      ngModelCtrl.$validity.addValidator('test', function(value) {
        return valid;
      });

      spyOn(ngModelCtrl.$validity.$validators.test, 'validatorFn').and.callThrough();

      changeInput('value');

      // trigger async apply
      scope.$digest();

      expect(ngModelCtrl.$modelValue).toBe('value');
      expect(scope.value).toBe('value');

      valid = false;
      ngModelCtrl.$validity.validate(ngModelCtrl.$modelValue).then(function(validationResults) {
        if (!validationResults.isValid) {
          ngModelCtrl.$modelValue = null;
          //Possibly need to replace the model set and state set logic here
          //state is difficult to set because I need the whole state object (?)
        }
      });

      scope.$digest();

      expect(ngModelCtrl.$modelValue).toBe(null);
      expect(ngModelCtrl.$valid).toBe(false);
    });
  });

  xdescribe('collection values handling', function() {

    //Okay, transforms + collections obviously don't work together like they did before.
    //Probably a good thing
    //Curious: even if I don't specify a parser in a transform, the parse pipeline will still try to call
    //it (identity function)
    //Now if you have isCollections specified inside the ngModelCtrl and your transform parser
    //does not handle collections, the whole mechanism breaks
    it('should format handle collections via transforms', function() {

      setup();

      //This would go into an ngList like directive
      function splitterFn(strValue) {
        return strValue.split(', ');
      }

      function joinerFn(arrValue) {
        return arrValue.join(',');
      }

      ngModelCtrl.$isCollection = true;
      //Problem: how to make sure the joiner is called last and the splitter first?
      ngModelCtrl.$transforms.insert('splitter', splitterFn, null, true);
      ngModelCtrl.$transforms.append('joiner', null, joinerFn, true);

      //This are normal transforms
      function formatFn(value) {
        return value.splice(-2);
      }

      function parseFn(value) {
        return value + 'ab';
      }

      ngModelCtrl.$transforms.append('simpleParse', parseFn, null);
      ngModelCtrl.$transforms.insert('simpleFormat', null, formatFn);

      ngModelCtrl.$validity.addValidator('test', function(value) {
        return true;
      });

      changeInput('value, value2');

      // trigger async apply
      scope.$digest();

      expect(ngModelCtrl.$modelValue).toEqual(['valueab', 'value2ab']);
      expect(scope.value).toEqual(['valueab', 'value2ab']);

      changeScope(['asdf', 'blubb']);

      expect(ngModelCtrl.$viewValue).toEqual('as, blu');
    });
  });

});