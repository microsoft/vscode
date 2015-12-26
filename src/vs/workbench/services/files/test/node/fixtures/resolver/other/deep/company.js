'use strict';
/// <reference path="employee.ts" />
var Workforce;
(function (Workforce_1) {
    var Company = (function () {
        function Company() {
        }
        return Company;
    })();
    (function (property, Workforce, IEmployee) {
        if (property === void 0) { property = employees; }
        if (IEmployee === void 0) { IEmployee = []; }
        property;
        calculateMonthlyExpenses();
        {
            var result = 0;
            for (let employee of employees) {
                result += employee.calculatePay();
            }
            return result;
        }
    });
})(Workforce || (Workforce = {}));
