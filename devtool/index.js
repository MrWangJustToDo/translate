(function () {
    'use strict';

    var reactShared = {exports: {}};

    var index_production$1 = {};

    var hasRequiredIndex_production$1;

    function requireIndex_production$1 () {
    	if (hasRequiredIndex_production$1) return index_production$1;
    	hasRequiredIndex_production$1 = 1;
    	(function (exports) {

    		var merge = function (src, rest) {
    		    return src | rest;
    		};
    		var remove = function (src, rest) {
    		    if (src & rest) {
    		        return src ^ rest;
    		    }
    		    else {
    		        return src;
    		    }
    		};
    		var include = function (src, rest) {
    		    return !!(src & rest);
    		};
    		var exclude = function (src, rest) {
    		    return !(src & rest);
    		};

    		/******************************************************************************
    		Copyright (c) Microsoft Corporation.

    		Permission to use, copy, modify, and/or distribute this software for any
    		purpose with or without fee is hereby granted.

    		THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    		REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    		AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    		INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    		LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    		OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    		PERFORMANCE OF THIS SOFTWARE.
    		***************************************************************************** */
    		/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


    		function __spreadArray(to, from, pack) {
    		    if (arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    		        if (ar || !(i in from)) {
    		            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    		            ar[i] = from[i];
    		        }
    		    }
    		    return to.concat(ar || Array.prototype.slice.call(from));
    		}

    		typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    		    var e = new Error(message);
    		    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    		};

    		var once = function (action) {
    		    var called = false;
    		    return function () {
    		        var args = [];
    		        for (var _i = 0; _i < arguments.length; _i++) {
    		            args[_i] = arguments[_i];
    		        }
    		        if (called)
    		            return;
    		        called = true;
    		        if (typeof action === "function")
    		            action.call.apply(action, __spreadArray([null], args, false));
    		    };
    		};

    		var TYPEKEY = "$$typeof";
    		var Element = Symbol.for("react.element");
    		var Memo = Symbol.for("react.memo");
    		var ForwardRef = Symbol.for("react.forward_ref");
    		var Portal = Symbol.for("react.portal");
    		var Fragment = Symbol.for("react.fragment");
    		var Context = Symbol.for("react.context");
    		var Provider = Symbol.for("react.provider");
    		var Consumer = Symbol.for("react.consumer");
    		var Lazy = Symbol.for("react.lazy");
    		var Suspense = Symbol.for("react.suspense");
    		var Strict = Symbol.for("react.strict_mode");
    		var Root = Symbol.for("react.root");
    		var Scope = Symbol.for("react.scope");
    		var ScopeLazy = Symbol.for("react.scope_lazy");
    		var ScopeSuspense = Symbol.for("react.scope_suspense");
    		var Comment = Symbol.for("react.comment");
    		var Offscreen = Symbol.for("react.offscreen");
    		var Activity = Symbol.for("react.activity");
    		var Profiler = Symbol.for("react.profiler");

    		function isObject(target) {
    		    return typeof target === "object" && target !== null;
    		}
    		function isFunction(target) {
    		    return typeof target === "function";
    		}
    		function isArray(target) {
    		    return Array.isArray(target);
    		}
    		function isSymbol(target) {
    		    return typeof target === "symbol";
    		}
    		function isString(target) {
    		    return typeof target === "string";
    		}
    		function isInteger(target) {
    		    return Number.isInteger(Number(target));
    		}
    		function isNumber(target) {
    		    return typeof target === "number";
    		}
    		function isCollection(target) {
    		    return target instanceof Map || target instanceof Set || target instanceof WeakMap || target instanceof WeakSet;
    		}
    		var isPromise = function (val) {
    		    return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
    		};

    		var UniqueArray = /** @class */ (function () {
    		    function UniqueArray() {
    		        this.set = new Set();
    		        this.arr = new Array();
    		        this.length = 0;
    		    }
    		    UniqueArray.prototype.uniPop = function () {
    		        var v = this.arr.pop();
    		        this.set.delete(v);
    		        this.length--;
    		        return v;
    		    };
    		    UniqueArray.prototype.uniPush = function (v) {
    		        if (this.set.has(v))
    		            return 0;
    		        this.set.add(v);
    		        this.arr.push(v);
    		        this.length++;
    		    };
    		    UniqueArray.prototype.uniShift = function () {
    		        var v = this.arr.shift();
    		        this.set.delete(v);
    		        this.length--;
    		        return v;
    		    };
    		    UniqueArray.prototype.uniUnshift = function (v) {
    		        if (this.set.has(v))
    		            return 0;
    		        this.set.add(v);
    		        this.arr.unshift(v);
    		        this.length++;
    		    };
    		    UniqueArray.prototype.uniDelete = function (v) {
    		        if (this.set.has(v)) {
    		            this.set.delete(v);
    		            this.arr = this.arr.filter(function (i) { return i !== v; });
    		            this.length--;
    		        }
    		    };
    		    UniqueArray.prototype.clear = function () {
    		        this.length = 0;
    		        this.set.clear();
    		        this.arr.length = 0;
    		    };
    		    UniqueArray.prototype.getAll = function () {
    		        return Array.from(this.arr);
    		    };
    		    return UniqueArray;
    		}());

    		exports.HOOK_TYPE = void 0;
    		(function (HOOK_TYPE) {
    		    HOOK_TYPE[HOOK_TYPE["useId"] = 0] = "useId";
    		    HOOK_TYPE[HOOK_TYPE["useRef"] = 1] = "useRef";
    		    HOOK_TYPE[HOOK_TYPE["useMemo"] = 2] = "useMemo";
    		    HOOK_TYPE[HOOK_TYPE["useState"] = 3] = "useState";
    		    HOOK_TYPE[HOOK_TYPE["useSignal"] = 4] = "useSignal";
    		    HOOK_TYPE[HOOK_TYPE["useEffect"] = 5] = "useEffect";
    		    HOOK_TYPE[HOOK_TYPE["useContext"] = 6] = "useContext";
    		    HOOK_TYPE[HOOK_TYPE["useReducer"] = 7] = "useReducer";
    		    HOOK_TYPE[HOOK_TYPE["useCallback"] = 8] = "useCallback";
    		    HOOK_TYPE[HOOK_TYPE["useTransition"] = 9] = "useTransition";
    		    HOOK_TYPE[HOOK_TYPE["useDebugValue"] = 10] = "useDebugValue";
    		    HOOK_TYPE[HOOK_TYPE["useLayoutEffect"] = 11] = "useLayoutEffect";
    		    HOOK_TYPE[HOOK_TYPE["useDeferredValue"] = 12] = "useDeferredValue";
    		    HOOK_TYPE[HOOK_TYPE["useInsertionEffect"] = 13] = "useInsertionEffect";
    		    HOOK_TYPE[HOOK_TYPE["useImperativeHandle"] = 14] = "useImperativeHandle";
    		    HOOK_TYPE[HOOK_TYPE["useSyncExternalStore"] = 15] = "useSyncExternalStore";
    		    HOOK_TYPE[HOOK_TYPE["useOptimistic"] = 16] = "useOptimistic";
    		    HOOK_TYPE[HOOK_TYPE["useEffectEvent"] = 17] = "useEffectEvent";
    		})(exports.HOOK_TYPE || (exports.HOOK_TYPE = {}));

    		exports.UpdateQueueType = void 0;
    		(function (UpdateQueueType) {
    		    UpdateQueueType[UpdateQueueType["component"] = 1] = "component";
    		    UpdateQueueType[UpdateQueueType["hook"] = 2] = "hook";
    		    UpdateQueueType[UpdateQueueType["context"] = 3] = "context";
    		    UpdateQueueType[UpdateQueueType["hmr"] = 4] = "hmr";
    		    UpdateQueueType[UpdateQueueType["trigger"] = 5] = "trigger";
    		    UpdateQueueType[UpdateQueueType["suspense"] = 6] = "suspense";
    		    UpdateQueueType[UpdateQueueType["lazy"] = 7] = "lazy";
    		    UpdateQueueType[UpdateQueueType["promise"] = 8] = "promise";
    		})(exports.UpdateQueueType || (exports.UpdateQueueType = {}));

    		exports.STATE_TYPE = void 0;
    		(function (STATE_TYPE) {
    		    STATE_TYPE[STATE_TYPE["__initial__"] = 0] = "__initial__";
    		    STATE_TYPE[STATE_TYPE["__create__"] = 1] = "__create__";
    		    STATE_TYPE[STATE_TYPE["__stable__"] = 2] = "__stable__";
    		    STATE_TYPE[STATE_TYPE["__inherit__"] = 4] = "__inherit__";
    		    STATE_TYPE[STATE_TYPE["__triggerConcurrent__"] = 8] = "__triggerConcurrent__";
    		    STATE_TYPE[STATE_TYPE["__triggerConcurrentForce__"] = 16] = "__triggerConcurrentForce__";
    		    STATE_TYPE[STATE_TYPE["__triggerSync__"] = 32] = "__triggerSync__";
    		    STATE_TYPE[STATE_TYPE["__triggerSyncForce__"] = 64] = "__triggerSyncForce__";
    		    STATE_TYPE[STATE_TYPE["__unmount__"] = 128] = "__unmount__";
    		    STATE_TYPE[STATE_TYPE["__hmr__"] = 256] = "__hmr__";
    		    STATE_TYPE[STATE_TYPE["__retrigger__"] = 512] = "__retrigger__";
    		    STATE_TYPE[STATE_TYPE["__reschedule__"] = 1024] = "__reschedule__";
    		    STATE_TYPE[STATE_TYPE["__recreate__"] = 2048] = "__recreate__";
    		    STATE_TYPE[STATE_TYPE["__suspense__"] = 4096] = "__suspense__";
    		})(exports.STATE_TYPE || (exports.STATE_TYPE = {}));

    		exports.PATCH_TYPE = void 0;
    		(function (PATCH_TYPE) {
    		    PATCH_TYPE[PATCH_TYPE["__initial__"] = 0] = "__initial__";
    		    PATCH_TYPE[PATCH_TYPE["__create__"] = 1] = "__create__";
    		    PATCH_TYPE[PATCH_TYPE["__update__"] = 2] = "__update__";
    		    PATCH_TYPE[PATCH_TYPE["__append__"] = 4] = "__append__";
    		    PATCH_TYPE[PATCH_TYPE["__position__"] = 8] = "__position__";
    		    PATCH_TYPE[PATCH_TYPE["__effect__"] = 16] = "__effect__";
    		    PATCH_TYPE[PATCH_TYPE["__layoutEffect__"] = 32] = "__layoutEffect__";
    		    PATCH_TYPE[PATCH_TYPE["__insertionEffect__"] = 64] = "__insertionEffect__";
    		    PATCH_TYPE[PATCH_TYPE["__unmount__"] = 128] = "__unmount__";
    		    PATCH_TYPE[PATCH_TYPE["__ref__"] = 256] = "__ref__";
    		})(exports.PATCH_TYPE || (exports.PATCH_TYPE = {}));

    		exports.Effect_TYPE = void 0;
    		(function (Effect_TYPE) {
    		    Effect_TYPE[Effect_TYPE["__initial__"] = 0] = "__initial__";
    		    Effect_TYPE[Effect_TYPE["__effect__"] = 1] = "__effect__";
    		    Effect_TYPE[Effect_TYPE["__unmount__"] = 2] = "__unmount__";
    		})(exports.Effect_TYPE || (exports.Effect_TYPE = {}));

    		var compareVersion = function (version1, version2) {
    		    var compare = function (arr1, arr2) {
    		        if (arr1.length && arr2.length) {
    		            var v1 = arr1[0];
    		            var v2 = arr2[0];
    		            if (v1 > v2)
    		                return true;
    		            if (v2 > v1)
    		                return false;
    		            return compare(arr1.slice(1), arr2.slice(1));
    		        }
    		        if (arr1.length)
    		            return true;
    		        if (arr2.length)
    		            return false;
    		        return true;
    		    };
    		    return compare(version1.split(".").map(Number), version2.split(".").map(Number));
    		};

    		var isNormalEquals = function (src, target, isSkipKey) {
    		    var isEquals = Object.is(src, target);
    		    if (isEquals)
    		        return true;
    		    var hasSkipKeyFunction = typeof isSkipKey === "function";
    		    if (typeof src === "object" && typeof target === "object" && src !== null && target !== null) {
    		        var srcKeys = Object.keys(src);
    		        var targetKeys = Object.keys(target);
    		        if (srcKeys.length !== targetKeys.length)
    		            return false;
    		        var res = true;
    		        if (hasSkipKeyFunction) {
    		            for (var _i = 0, srcKeys_1 = srcKeys; _i < srcKeys_1.length; _i++) {
    		                var key = srcKeys_1[_i];
    		                if (isSkipKey(key) && key in target) {
    		                    continue;
    		                }
    		                else {
    		                    res = res && Object.is(src[key], target[key]);
    		                }
    		                if (!res)
    		                    return res;
    		            }
    		        }
    		        else {
    		            for (var _a = 0, srcKeys_2 = srcKeys; _a < srcKeys_2.length; _a++) {
    		                var key = srcKeys_2[_a];
    		                res = res && Object.is(src[key], target[key]);
    		                if (!res)
    		                    return res;
    		            }
    		        }
    		        return res;
    		    }
    		    return false;
    		};
    		var isArrayEquals = function (src, target) {
    		    var isEquals = Object.is(src, target);
    		    if (isEquals)
    		        return true;
    		    if (Array.isArray(src) && Array.isArray(target) && src.length === target.length) {
    		        var re = true;
    		        for (var key in src) {
    		            re = re && Object.is(src[key], target[key]);
    		            if (!re)
    		                return re;
    		        }
    		        return re;
    		    }
    		    return false;
    		};

    		var ListTreeNode = /** @class */ (function () {
    		    function ListTreeNode(value) {
    		        this.prev = null;
    		        this.next = null;
    		        this.value = value;
    		    }
    		    return ListTreeNode;
    		}());
    		var ListTree = /** @class */ (function () {
    		    function ListTree() {
    		        this.length = 0;
    		        var _stickyHead = null;
    		        Object.defineProperty(this, "stickyHead", {
    		            get: function () {
    		                return _stickyHead;
    		            },
    		            set: function (v) {
    		                _stickyHead = v;
    		            },
    		        });
    		        var _stickyFoot = null;
    		        Object.defineProperty(this, "stickyFoot", {
    		            get: function () {
    		                return _stickyFoot;
    		            },
    		            set: function (v) {
    		                _stickyFoot = v;
    		            },
    		        });
    		        var _head = null;
    		        Object.defineProperty(this, "head", {
    		            get: function () {
    		                return _head;
    		            },
    		            set: function (v) {
    		                _head = v;
    		            },
    		        });
    		        var _foot = null;
    		        Object.defineProperty(this, "foot", {
    		            get: function () {
    		                return _foot;
    		            },
    		            set: function (v) {
    		                _foot = v;
    		            },
    		        });
    		    }
    		    ListTree.prototype.push = function (node) {
    		        var listNode = new ListTreeNode(node);
    		        this.length++;
    		        if (!this.foot) {
    		            this.head = listNode;
    		            this.foot = listNode;
    		        }
    		        else {
    		            this.foot.next = listNode;
    		            listNode.prev = this.foot;
    		            this.foot = listNode;
    		        }
    		    };
    		    ListTree.prototype.pushToLast = function (node) {
    		        if (this.stickyFoot) {
    		            var node_1 = this.stickyFoot;
    		            this.push(node_1.value);
    		            this.stickyFoot = null;
    		        }
    		        else {
    		            this.length++;
    		        }
    		        var listNode = new ListTreeNode(node);
    		        this.stickyFoot = listNode;
    		    };
    		    ListTree.prototype.pushToHead = function (node) {
    		        if (this.stickyHead) {
    		            var node_2 = this.stickyHead;
    		            this.unshift(node_2.value);
    		            this.stickyHead = null;
    		        }
    		        else {
    		            this.length++;
    		        }
    		        var listNode = new ListTreeNode(node);
    		        this.stickyHead = listNode;
    		    };
    		    ListTree.prototype.pop = function () {
    		        var foot = this.stickyFoot || this.foot || this.stickyHead;
    		        if (foot) {
    		            this.delete(foot);
    		            return foot.value;
    		        }
    		        else {
    		            return null;
    		        }
    		    };
    		    ListTree.prototype.unshift = function (node) {
    		        var listNode = new ListTreeNode(node);
    		        this.length++;
    		        if (!this.head) {
    		            this.head = listNode;
    		            this.foot = listNode;
    		        }
    		        else {
    		            this.head.prev = listNode;
    		            listNode.next = this.head;
    		            this.head = listNode;
    		        }
    		    };
    		    ListTree.prototype.unshiftToHead = function (node) {
    		        if (this.stickyHead) {
    		            var node_3 = this.stickyHead;
    		            this.unshift(node_3.value);
    		            this.stickyHead = null;
    		        }
    		        else {
    		            this.length++;
    		        }
    		        var listNode = new ListTreeNode(node);
    		        this.stickyHead = listNode;
    		    };
    		    ListTree.prototype.unshiftToFoot = function (node) {
    		        if (this.stickyFoot) {
    		            var node_4 = this.stickyFoot;
    		            this.push(node_4.value);
    		            this.stickyFoot = null;
    		        }
    		        else {
    		            this.length++;
    		        }
    		        var listNode = new ListTreeNode(node);
    		        this.stickyFoot = listNode;
    		    };
    		    ListTree.prototype.shift = function () {
    		        var head = this.stickyHead || this.head || this.stickyFoot;
    		        if (head) {
    		            this.delete(head);
    		            return head.value;
    		        }
    		        else {
    		            return null;
    		        }
    		    };
    		    ListTree.prototype.pickHead = function () {
    		        var _a, _b;
    		        return ((_a = this.stickyHead) === null || _a === void 0 ? void 0 : _a.value) || ((_b = this.head) === null || _b === void 0 ? void 0 : _b.value);
    		    };
    		    ListTree.prototype.pickFoot = function () {
    		        var _a, _b;
    		        return ((_a = this.stickyFoot) === null || _a === void 0 ? void 0 : _a.value) || ((_b = this.foot) === null || _b === void 0 ? void 0 : _b.value);
    		    };
    		    ListTree.prototype.listToFoot = function (action) {
    		        if (this.stickyHead) {
    		            action(this.stickyHead.value);
    		        }
    		        var node = this.head;
    		        while (node) {
    		            action(node.value);
    		            node = node.next;
    		        }
    		        if (this.stickyFoot) {
    		            action(this.stickyFoot.value);
    		        }
    		    };
    		    ListTree.prototype.listToHead = function (action) {
    		        if (this.stickyFoot) {
    		            action(this.stickyFoot.value);
    		        }
    		        var node = this.foot;
    		        while (node) {
    		            action(node.value);
    		            node = node.prev;
    		        }
    		        if (this.stickyHead) {
    		            action(this.stickyHead.value);
    		        }
    		    };
    		    ListTree.prototype.toArray = function () {
    		        var re = [];
    		        this.listToFoot(function (v) { return re.push(v); });
    		        return re;
    		    };
    		    ListTree.prototype.delete = function (node) {
    		        if (this.stickyHead === node) {
    		            this.stickyHead = null;
    		            this.length--;
    		        }
    		        else if (this.stickyFoot === node) {
    		            this.stickyFoot = null;
    		            this.length--;
    		        }
    		        else if (this.head === node) {
    		            var next = node.next;
    		            node.next = null;
    		            if (next) {
    		                this.head = next;
    		                next.prev = null;
    		            }
    		            else {
    		                this.head = null;
    		                this.foot = null;
    		            }
    		            this.length--;
    		        }
    		        else if (this.foot === node) {
    		            var prev = node.prev;
    		            node.prev = null;
    		            if (prev) {
    		                this.foot = prev;
    		                prev.next = null;
    		            }
    		            else {
    		                this.head = null;
    		                this.foot = null;
    		            }
    		            this.length--;
    		        }
    		        else if (this.hasNode(node)) {
    		            var prev = node.prev;
    		            var next = node.next;
    		            node.prev = null;
    		            node.next = null;
    		            prev.next = next;
    		            next.prev = prev;
    		            this.length--;
    		        }
    		    };
    		    ListTree.prototype.size = function () {
    		        return this.length;
    		    };
    		    ListTree.prototype.hasNode = function (node) {
    		        if (this.stickyHead && Object.is(this.stickyHead, node))
    		            return true;
    		        if (this.stickyFoot && Object.is(this.stickyFoot, node))
    		            return true;
    		        var listNode = this.head;
    		        while (listNode) {
    		            if (Object.is(listNode, node))
    		                return true;
    		            listNode = listNode.next;
    		        }
    		        return false;
    		    };
    		    ListTree.prototype.hasValue = function (node) {
    		        if (this.stickyHead && Object.is(this.stickyHead.value, node))
    		            return true;
    		        if (this.stickyFoot && Object.is(this.stickyFoot.value, node))
    		            return true;
    		        var listNode = this.head;
    		        while (listNode) {
    		            if (Object.is(listNode.value, node))
    		                return true;
    		            listNode = listNode.next;
    		        }
    		        return false;
    		    };
    		    ListTree.prototype.some = function (iterator) {
    		        var re = false;
    		        this.listToFoot(function (node) {
    		            re = re || iterator(node);
    		        });
    		        return re;
    		    };
    		    ListTree.prototype.every = function (iterator) {
    		        var re = true;
    		        this.listToFoot(function (node) {
    		            re = re && iterator(node);
    		        });
    		        return re;
    		    };
    		    ListTree.prototype.concat = function (list) {
    		        var newList = new ListTree();
    		        this.listToFoot(function (node) { return newList.push(node); });
    		        list.listToFoot(function (node) { return newList.push(node); });
    		        return newList;
    		    };
    		    ListTree.prototype.clone = function () {
    		        var newList = new ListTree();
    		        this.listToFoot(function (v) { return newList.push(v); });
    		        return newList;
    		    };
    		    ListTree.prototype.clear = function () {
    		        this.length = 0;
    		        this.head = null;
    		        this.foot = null;
    		        this.stickyHead = null;
    		        this.stickyFoot = null;
    		    };
    		    return ListTree;
    		}());

    		exports.Activity = Activity;
    		exports.Comment = Comment;
    		exports.Consumer = Consumer;
    		exports.Context = Context;
    		exports.Element = Element;
    		exports.ForwardRef = ForwardRef;
    		exports.Fragment = Fragment;
    		exports.Lazy = Lazy;
    		exports.ListTree = ListTree;
    		exports.ListTreeNode = ListTreeNode;
    		exports.Memo = Memo;
    		exports.Offscreen = Offscreen;
    		exports.Portal = Portal;
    		exports.Profiler = Profiler;
    		exports.Provider = Provider;
    		exports.Root = Root;
    		exports.Scope = Scope;
    		exports.ScopeLazy = ScopeLazy;
    		exports.ScopeSuspense = ScopeSuspense;
    		exports.Strict = Strict;
    		exports.Suspense = Suspense;
    		exports.TYPEKEY = TYPEKEY;
    		exports.UniqueArray = UniqueArray;
    		exports.compareVersion = compareVersion;
    		exports.exclude = exclude;
    		exports.include = include;
    		exports.isArray = isArray;
    		exports.isArrayEquals = isArrayEquals;
    		exports.isCollection = isCollection;
    		exports.isFunction = isFunction;
    		exports.isInteger = isInteger;
    		exports.isNormalEquals = isNormalEquals;
    		exports.isNumber = isNumber;
    		exports.isObject = isObject;
    		exports.isPromise = isPromise;
    		exports.isString = isString;
    		exports.isSymbol = isSymbol;
    		exports.merge = merge;
    		exports.once = once;
    		exports.remove = remove; 
    	} (index_production$1));
    	return index_production$1;
    }

    var hasRequiredReactShared;

    function requireReactShared () {
    	if (hasRequiredReactShared) return reactShared.exports;
    	hasRequiredReactShared = 1;

    	{
    	  reactShared.exports = requireIndex_production$1();
    	}
    	return reactShared.exports;
    }

    var reactSharedExports = requireReactShared();

    var event$1 = {};

    var hasRequiredEvent$1;

    function requireEvent$1 () {
    	if (hasRequiredEvent$1) return event$1;
    	hasRequiredEvent$1 = 1;
    	(function (exports) {

    		exports.MessageHookType = void 0;
    		(function (MessageHookType) {
    		    MessageHookType["init"] = "hook-init";
    		    MessageHookType["mount"] = "hook-mount";
    		    MessageHookType["render"] = "hook-render";
    		    MessageHookType["origin"] = "hook-origin";
    		    MessageHookType["clear"] = "hook-clear";
    		})(exports.MessageHookType || (exports.MessageHookType = {}));
    		exports.MessageDetectorType = void 0;
    		(function (MessageDetectorType) {
    		    MessageDetectorType["init"] = "detector-init";
    		})(exports.MessageDetectorType || (exports.MessageDetectorType = {}));
    		exports.MessageProxyType = void 0;
    		(function (MessageProxyType) {
    		    MessageProxyType["init"] = "proxy-init";
    		})(exports.MessageProxyType || (exports.MessageProxyType = {}));
    		exports.MessagePanelType = void 0;
    		(function (MessagePanelType) {
    		    MessagePanelType["show"] = "panel-show";
    		    MessagePanelType["hide"] = "panel-hide";
    		    MessagePanelType["varStore"] = "panel-var-store";
    		    MessagePanelType["varSource"] = "panel-var-source";
    		    MessagePanelType["enableHover"] = "panel-enable-hover";
    		    MessagePanelType["enableUpdate"] = "panel-enable-update";
    		    MessagePanelType["enableRetrigger"] = "panel-enable-retrigger";
    		    MessagePanelType["enableHoverOnBrowser"] = "panel-enable-hover-on-browser";
    		    MessagePanelType["enableRecord"] = "panel-enable-record";
    		    MessagePanelType["nodeHover"] = "panel-hover";
    		    MessagePanelType["nodeSelect"] = "panel-select";
    		    MessagePanelType["nodeStore"] = "panel-store";
    		    MessagePanelType["nodeEditor"] = "panel-editor";
    		    MessagePanelType["nodeTrigger"] = "panel-trigger";
    		    MessagePanelType["nodeInspect"] = "panel-inspect";
    		    MessagePanelType["chunks"] = "panel-chunks";
    		    MessagePanelType["clear"] = "panel-clear";
    		    MessagePanelType["clearHMR"] = "panel-clear-hmr";
    		    MessagePanelType["clearMessage"] = "panel-clear-message";
    		    MessagePanelType["clearTrigger"] = "panel-clear-trigger";
    		})(exports.MessagePanelType || (exports.MessagePanelType = {}));
    		exports.MessageWorkerType = void 0;
    		(function (MessageWorkerType) {
    		    MessageWorkerType["init"] = "worker-init";
    		    MessageWorkerType["close"] = "worker-close";
    		})(exports.MessageWorkerType || (exports.MessageWorkerType = {}));
    		exports.DevToolMessageEnum = void 0;
    		(function (DevToolMessageEnum) {
    		    // 初始化，判断是否用@my-react进行页面渲染
    		    DevToolMessageEnum["init"] = "init";
    		    DevToolMessageEnum["dir"] = "dir";
    		    DevToolMessageEnum["config"] = "config";
    		    // tree ready
    		    DevToolMessageEnum["ready"] = "ready";
    		    // tree update
    		    DevToolMessageEnum["update"] = "update";
    		    DevToolMessageEnum["changed"] = "changed";
    		    DevToolMessageEnum["highlight"] = "highlight";
    		    DevToolMessageEnum["trigger"] = "trigger";
    		    DevToolMessageEnum["triggerStatus"] = "triggerStatus";
    		    DevToolMessageEnum["hmr"] = "hmr";
    		    DevToolMessageEnum["hmrStatus"] = "hmrStatus";
    		    DevToolMessageEnum["hmrInternal"] = "hmrInternal";
    		    DevToolMessageEnum["source"] = "source";
    		    DevToolMessageEnum["detail"] = "detail";
    		    DevToolMessageEnum["unmount"] = "unmount";
    		    DevToolMessageEnum["unmountNode"] = "unmount-node";
    		    DevToolMessageEnum["selectSync"] = "select-sync";
    		    DevToolMessageEnum["message"] = "message";
    		    DevToolMessageEnum["warn"] = "warn";
    		    DevToolMessageEnum["warnStatus"] = "warnStatus";
    		    DevToolMessageEnum["error"] = "error";
    		    DevToolMessageEnum["errorStatus"] = "errorStatus";
    		    DevToolMessageEnum["chunks"] = "chunks";
    		    DevToolMessageEnum["record"] = "record";
    		    DevToolMessageEnum["domHover"] = "dom-hover";
    		})(exports.DevToolMessageEnum || (exports.DevToolMessageEnum = {}));
    		exports.HMRStatus = void 0;
    		(function (HMRStatus) {
    		    HMRStatus[HMRStatus["none"] = 0] = "none";
    		    HMRStatus[HMRStatus["refresh"] = 1] = "refresh";
    		    HMRStatus[HMRStatus["remount"] = 2] = "remount";
    		})(exports.HMRStatus || (exports.HMRStatus = {}));
    		var DevToolSource = "@my-react/devtool";

    		exports.DevToolSource = DevToolSource; 
    	} (event$1));
    	return event$1;
    }

    var event;
    var hasRequiredEvent;

    function requireEvent () {
    	if (hasRequiredEvent) return event;
    	hasRequiredEvent = 1;
    	event = requireEvent$1();
    	return event;
    }

    var eventExports = requireEvent();

    var core$1 = {exports: {}};

    var index_production = {};

    var errorStackParser$1 = {exports: {}};

    var stackframe$1 = {exports: {}};

    var stackframe = stackframe$1.exports;

    var hasRequiredStackframe;

    function requireStackframe () {
    	if (hasRequiredStackframe) return stackframe$1.exports;
    	hasRequiredStackframe = 1;
    	(function (module, exports) {
    		(function(root, factory) {
    		    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.

    		    /* istanbul ignore next */
    		    {
    		        module.exports = factory();
    		    }
    		}(stackframe, function() {
    		    function _isNumber(n) {
    		        return !isNaN(parseFloat(n)) && isFinite(n);
    		    }

    		    function _capitalize(str) {
    		        return str.charAt(0).toUpperCase() + str.substring(1);
    		    }

    		    function _getter(p) {
    		        return function() {
    		            return this[p];
    		        };
    		    }

    		    var booleanProps = ['isConstructor', 'isEval', 'isNative', 'isToplevel'];
    		    var numericProps = ['columnNumber', 'lineNumber'];
    		    var stringProps = ['fileName', 'functionName', 'source'];
    		    var arrayProps = ['args'];
    		    var objectProps = ['evalOrigin'];

    		    var props = booleanProps.concat(numericProps, stringProps, arrayProps, objectProps);

    		    function StackFrame(obj) {
    		        if (!obj) return;
    		        for (var i = 0; i < props.length; i++) {
    		            if (obj[props[i]] !== undefined) {
    		                this['set' + _capitalize(props[i])](obj[props[i]]);
    		            }
    		        }
    		    }

    		    StackFrame.prototype = {
    		        getArgs: function() {
    		            return this.args;
    		        },
    		        setArgs: function(v) {
    		            if (Object.prototype.toString.call(v) !== '[object Array]') {
    		                throw new TypeError('Args must be an Array');
    		            }
    		            this.args = v;
    		        },

    		        getEvalOrigin: function() {
    		            return this.evalOrigin;
    		        },
    		        setEvalOrigin: function(v) {
    		            if (v instanceof StackFrame) {
    		                this.evalOrigin = v;
    		            } else if (v instanceof Object) {
    		                this.evalOrigin = new StackFrame(v);
    		            } else {
    		                throw new TypeError('Eval Origin must be an Object or StackFrame');
    		            }
    		        },

    		        toString: function() {
    		            var fileName = this.getFileName() || '';
    		            var lineNumber = this.getLineNumber() || '';
    		            var columnNumber = this.getColumnNumber() || '';
    		            var functionName = this.getFunctionName() || '';
    		            if (this.getIsEval()) {
    		                if (fileName) {
    		                    return '[eval] (' + fileName + ':' + lineNumber + ':' + columnNumber + ')';
    		                }
    		                return '[eval]:' + lineNumber + ':' + columnNumber;
    		            }
    		            if (functionName) {
    		                return functionName + ' (' + fileName + ':' + lineNumber + ':' + columnNumber + ')';
    		            }
    		            return fileName + ':' + lineNumber + ':' + columnNumber;
    		        }
    		    };

    		    StackFrame.fromString = function StackFrame$$fromString(str) {
    		        var argsStartIndex = str.indexOf('(');
    		        var argsEndIndex = str.lastIndexOf(')');

    		        var functionName = str.substring(0, argsStartIndex);
    		        var args = str.substring(argsStartIndex + 1, argsEndIndex).split(',');
    		        var locationString = str.substring(argsEndIndex + 1);

    		        if (locationString.indexOf('@') === 0) {
    		            var parts = /@(.+?)(?::(\d+))?(?::(\d+))?$/.exec(locationString, '');
    		            var fileName = parts[1];
    		            var lineNumber = parts[2];
    		            var columnNumber = parts[3];
    		        }

    		        return new StackFrame({
    		            functionName: functionName,
    		            args: args || undefined,
    		            fileName: fileName,
    		            lineNumber: lineNumber || undefined,
    		            columnNumber: columnNumber || undefined
    		        });
    		    };

    		    for (var i = 0; i < booleanProps.length; i++) {
    		        StackFrame.prototype['get' + _capitalize(booleanProps[i])] = _getter(booleanProps[i]);
    		        StackFrame.prototype['set' + _capitalize(booleanProps[i])] = (function(p) {
    		            return function(v) {
    		                this[p] = Boolean(v);
    		            };
    		        })(booleanProps[i]);
    		    }

    		    for (var j = 0; j < numericProps.length; j++) {
    		        StackFrame.prototype['get' + _capitalize(numericProps[j])] = _getter(numericProps[j]);
    		        StackFrame.prototype['set' + _capitalize(numericProps[j])] = (function(p) {
    		            return function(v) {
    		                if (!_isNumber(v)) {
    		                    throw new TypeError(p + ' must be a Number');
    		                }
    		                this[p] = Number(v);
    		            };
    		        })(numericProps[j]);
    		    }

    		    for (var k = 0; k < stringProps.length; k++) {
    		        StackFrame.prototype['get' + _capitalize(stringProps[k])] = _getter(stringProps[k]);
    		        StackFrame.prototype['set' + _capitalize(stringProps[k])] = (function(p) {
    		            return function(v) {
    		                this[p] = String(v);
    		            };
    		        })(stringProps[k]);
    		    }

    		    return StackFrame;
    		})); 
    	} (stackframe$1));
    	return stackframe$1.exports;
    }

    var errorStackParser = errorStackParser$1.exports;

    var hasRequiredErrorStackParser;

    function requireErrorStackParser () {
    	if (hasRequiredErrorStackParser) return errorStackParser$1.exports;
    	hasRequiredErrorStackParser = 1;
    	(function (module, exports) {
    		(function(root, factory) {
    		    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.

    		    /* istanbul ignore next */
    		    {
    		        module.exports = factory(requireStackframe());
    		    }
    		}(errorStackParser, function ErrorStackParser(StackFrame) {

    		    var FIREFOX_SAFARI_STACK_REGEXP = /(^|@)\S+:\d+/;
    		    var CHROME_IE_STACK_REGEXP = /^\s*at .*(\S+:\d+|\(native\))/m;
    		    var SAFARI_NATIVE_CODE_REGEXP = /^(eval@)?(\[native code])?$/;

    		    return {
    		        /**
    		         * Given an Error object, extract the most information from it.
    		         *
    		         * @param {Error} error object
    		         * @return {Array} of StackFrames
    		         */
    		        parse: function ErrorStackParser$$parse(error) {
    		            if (typeof error.stacktrace !== 'undefined' || typeof error['opera#sourceloc'] !== 'undefined') {
    		                return this.parseOpera(error);
    		            } else if (error.stack && error.stack.match(CHROME_IE_STACK_REGEXP)) {
    		                return this.parseV8OrIE(error);
    		            } else if (error.stack) {
    		                return this.parseFFOrSafari(error);
    		            } else {
    		                throw new Error('Cannot parse given Error object');
    		            }
    		        },

    		        // Separate line and column numbers from a string of the form: (URI:Line:Column)
    		        extractLocation: function ErrorStackParser$$extractLocation(urlLike) {
    		            // Fail-fast but return locations like "(native)"
    		            if (urlLike.indexOf(':') === -1) {
    		                return [urlLike];
    		            }

    		            var regExp = /(.+?)(?::(\d+))?(?::(\d+))?$/;
    		            var parts = regExp.exec(urlLike.replace(/[()]/g, ''));
    		            return [parts[1], parts[2] || undefined, parts[3] || undefined];
    		        },

    		        parseV8OrIE: function ErrorStackParser$$parseV8OrIE(error) {
    		            var filtered = error.stack.split('\n').filter(function(line) {
    		                return !!line.match(CHROME_IE_STACK_REGEXP);
    		            }, this);

    		            return filtered.map(function(line) {
    		                if (line.indexOf('(eval ') > -1) {
    		                    // Throw away eval information until we implement stacktrace.js/stackframe#8
    		                    line = line.replace(/eval code/g, 'eval').replace(/(\(eval at [^()]*)|(,.*$)/g, '');
    		                }
    		                var sanitizedLine = line.replace(/^\s+/, '').replace(/\(eval code/g, '(').replace(/^.*?\s+/, '');

    		                // capture and preseve the parenthesized location "(/foo/my bar.js:12:87)" in
    		                // case it has spaces in it, as the string is split on \s+ later on
    		                var location = sanitizedLine.match(/ (\(.+\)$)/);

    		                // remove the parenthesized location from the line, if it was matched
    		                sanitizedLine = location ? sanitizedLine.replace(location[0], '') : sanitizedLine;

    		                // if a location was matched, pass it to extractLocation() otherwise pass all sanitizedLine
    		                // because this line doesn't have function name
    		                var locationParts = this.extractLocation(location ? location[1] : sanitizedLine);
    		                var functionName = location && sanitizedLine || undefined;
    		                var fileName = ['eval', '<anonymous>'].indexOf(locationParts[0]) > -1 ? undefined : locationParts[0];

    		                return new StackFrame({
    		                    functionName: functionName,
    		                    fileName: fileName,
    		                    lineNumber: locationParts[1],
    		                    columnNumber: locationParts[2],
    		                    source: line
    		                });
    		            }, this);
    		        },

    		        parseFFOrSafari: function ErrorStackParser$$parseFFOrSafari(error) {
    		            var filtered = error.stack.split('\n').filter(function(line) {
    		                return !line.match(SAFARI_NATIVE_CODE_REGEXP);
    		            }, this);

    		            return filtered.map(function(line) {
    		                // Throw away eval information until we implement stacktrace.js/stackframe#8
    		                if (line.indexOf(' > eval') > -1) {
    		                    line = line.replace(/ line (\d+)(?: > eval line \d+)* > eval:\d+:\d+/g, ':$1');
    		                }

    		                if (line.indexOf('@') === -1 && line.indexOf(':') === -1) {
    		                    // Safari eval frames only have function names and nothing else
    		                    return new StackFrame({
    		                        functionName: line
    		                    });
    		                } else {
    		                    var functionNameRegex = /((.*".+"[^@]*)?[^@]*)(?:@)/;
    		                    var matches = line.match(functionNameRegex);
    		                    var functionName = matches && matches[1] ? matches[1] : undefined;
    		                    var locationParts = this.extractLocation(line.replace(functionNameRegex, ''));

    		                    return new StackFrame({
    		                        functionName: functionName,
    		                        fileName: locationParts[0],
    		                        lineNumber: locationParts[1],
    		                        columnNumber: locationParts[2],
    		                        source: line
    		                    });
    		                }
    		            }, this);
    		        },

    		        parseOpera: function ErrorStackParser$$parseOpera(e) {
    		            if (!e.stacktrace || (e.message.indexOf('\n') > -1 &&
    		                e.message.split('\n').length > e.stacktrace.split('\n').length)) {
    		                return this.parseOpera9(e);
    		            } else if (!e.stack) {
    		                return this.parseOpera10(e);
    		            } else {
    		                return this.parseOpera11(e);
    		            }
    		        },

    		        parseOpera9: function ErrorStackParser$$parseOpera9(e) {
    		            var lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
    		            var lines = e.message.split('\n');
    		            var result = [];

    		            for (var i = 2, len = lines.length; i < len; i += 2) {
    		                var match = lineRE.exec(lines[i]);
    		                if (match) {
    		                    result.push(new StackFrame({
    		                        fileName: match[2],
    		                        lineNumber: match[1],
    		                        source: lines[i]
    		                    }));
    		                }
    		            }

    		            return result;
    		        },

    		        parseOpera10: function ErrorStackParser$$parseOpera10(e) {
    		            var lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
    		            var lines = e.stacktrace.split('\n');
    		            var result = [];

    		            for (var i = 0, len = lines.length; i < len; i += 2) {
    		                var match = lineRE.exec(lines[i]);
    		                if (match) {
    		                    result.push(
    		                        new StackFrame({
    		                            functionName: match[3] || undefined,
    		                            fileName: match[2],
    		                            lineNumber: match[1],
    		                            source: lines[i]
    		                        })
    		                    );
    		                }
    		            }

    		            return result;
    		        },

    		        // Opera 10.65+ Error.stack very similar to FF/Safari
    		        parseOpera11: function ErrorStackParser$$parseOpera11(error) {
    		            var filtered = error.stack.split('\n').filter(function(line) {
    		                return !!line.match(FIREFOX_SAFARI_STACK_REGEXP) && !line.match(/^Error created at/);
    		            }, this);

    		            return filtered.map(function(line) {
    		                var tokens = line.split('@');
    		                var locationParts = this.extractLocation(tokens.pop());
    		                var functionCall = (tokens.shift() || '');
    		                var functionName = functionCall
    		                    .replace(/<anonymous function(: (\w+))?>/, '$2')
    		                    .replace(/\([^)]*\)/g, '') || undefined;
    		                var argsRaw;
    		                if (functionCall.match(/\(([^)]*)\)/)) {
    		                    argsRaw = functionCall.replace(/^[^(]+\(([^)]*)\)$/, '$1');
    		                }
    		                var args = (argsRaw === undefined || argsRaw === '[arguments not available]') ?
    		                    undefined : argsRaw.split(',');

    		                return new StackFrame({
    		                    functionName: functionName,
    		                    args: args,
    		                    fileName: locationParts[0],
    		                    lineNumber: locationParts[1],
    		                    columnNumber: locationParts[2],
    		                    source: line
    		                });
    		            }, this);
    		        }
    		    };
    		})); 
    	} (errorStackParser$1));
    	return errorStackParser$1.exports;
    }

    var hasRequiredIndex_production;

    function requireIndex_production () {
    	if (hasRequiredIndex_production) return index_production;
    	hasRequiredIndex_production = 1;
    	(function (exports) {

    		var reactShared = requireReactShared();
    		var ErrorStackParser = requireErrorStackParser();

    		/******************************************************************************
    		Copyright (c) Microsoft Corporation.

    		Permission to use, copy, modify, and/or distribute this software for any
    		purpose with or without fee is hereby granted.

    		THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    		REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    		AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    		INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    		LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    		OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    		PERFORMANCE OF THIS SOFTWARE.
    		***************************************************************************** */
    		/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


    		var __assign = function() {
    		    __assign = Object.assign || function __assign(t) {
    		        for (var s, i = 1, n = arguments.length; i < n; i++) {
    		            s = arguments[i];
    		            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
    		        }
    		        return t;
    		    };
    		    return __assign.apply(this, arguments);
    		};

    		function __spreadArray(to, from, pack) {
    		    if (arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    		        if (ar || !(i in from)) {
    		            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
    		            ar[i] = from[i];
    		        }
    		    }
    		    return to.concat(ar || Array.prototype.slice.call(from));
    		}

    		typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    		    var e = new Error(message);
    		    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    		};

    		var id$1 = 0;
    		// PlainNode is a simplified version of FiberNode just for show the structure
    		var PlainNode = /** @class */ (function () {
    		    // hooks: HOOKTree[];
    		    function PlainNode(_id) {
    		        this.i = _id || "".concat(id$1++);
    		    }
    		    return PlainNode;
    		}());

    		// sync from import { NODE_TYPE } from '@my-react/react-reconciler';
    		exports.NODE_TYPE = void 0;
    		(function (NODE_TYPE) {
    		    NODE_TYPE[NODE_TYPE["__initial__"] = 0] = "__initial__";
    		    NODE_TYPE[NODE_TYPE["__class__"] = 1] = "__class__";
    		    NODE_TYPE[NODE_TYPE["__function__"] = 2] = "__function__";
    		    NODE_TYPE[NODE_TYPE["__lazy__"] = 4] = "__lazy__";
    		    NODE_TYPE[NODE_TYPE["__memo__"] = 8] = "__memo__";
    		    NODE_TYPE[NODE_TYPE["__forwardRef__"] = 16] = "__forwardRef__";
    		    NODE_TYPE[NODE_TYPE["__provider__"] = 32] = "__provider__";
    		    NODE_TYPE[NODE_TYPE["__consumer__"] = 64] = "__consumer__";
    		    NODE_TYPE[NODE_TYPE["__portal__"] = 128] = "__portal__";
    		    NODE_TYPE[NODE_TYPE["__null__"] = 256] = "__null__";
    		    NODE_TYPE[NODE_TYPE["__text__"] = 512] = "__text__";
    		    NODE_TYPE[NODE_TYPE["__empty__"] = 1024] = "__empty__";
    		    NODE_TYPE[NODE_TYPE["__plain__"] = 2048] = "__plain__";
    		    NODE_TYPE[NODE_TYPE["__strict__"] = 4096] = "__strict__";
    		    NODE_TYPE[NODE_TYPE["__suspense__"] = 8192] = "__suspense__";
    		    NODE_TYPE[NODE_TYPE["__fragment__"] = 16384] = "__fragment__";
    		    NODE_TYPE[NODE_TYPE["__internal__"] = 32768] = "__internal__";
    		    NODE_TYPE[NODE_TYPE["__scope__"] = 65536] = "__scope__";
    		    NODE_TYPE[NODE_TYPE["__comment__"] = 131072] = "__comment__";
    		    NODE_TYPE[NODE_TYPE["__profiler__"] = 262144] = "__profiler__";
    		    NODE_TYPE[NODE_TYPE["__context__"] = 524288] = "__context__";
    		    NODE_TYPE[NODE_TYPE["__scopeLazy__"] = 1048576] = "__scopeLazy__";
    		    NODE_TYPE[NODE_TYPE["__scopeSuspense__"] = 2097152] = "__scopeSuspense__";
    		    NODE_TYPE[NODE_TYPE["__activity__"] = 4194304] = "__activity__";
    		})(exports.NODE_TYPE || (exports.NODE_TYPE = {}));

    		var typeKeys = [];
    		// SEE https://github.com/facebook/react/blob/main/compiler/packages/react-compiler-runtime/src/index.ts
    		var reactCompilerSymbol = Symbol.for("react.memo_cache_sentinel");
    		Object.keys(exports.NODE_TYPE).forEach(function (key) {
    		    if (!key.startsWith("__")) {
    		        typeKeys.push(+key);
    		    }
    		});
    		var getTypeName = function (type) {
    		    switch (type) {
    		        case exports.NODE_TYPE.__internal__:
    		            return "KEEP——Internal (not used)";
    		        case exports.NODE_TYPE.__memo__:
    		            return "Memo";
    		        case exports.NODE_TYPE.__forwardRef__:
    		            return "ForwardRef";
    		        case exports.NODE_TYPE.__lazy__:
    		            return "Lazy";
    		        case exports.NODE_TYPE.__provider__:
    		            return "Provider";
    		        case exports.NODE_TYPE.__consumer__:
    		            return "Consumer";
    		        case exports.NODE_TYPE.__fragment__:
    		            return "Fragment";
    		        case exports.NODE_TYPE.__scope__:
    		            return "Scope";
    		        case exports.NODE_TYPE.__strict__:
    		            return "Strict";
    		        case exports.NODE_TYPE.__profiler__:
    		            return "Profiler";
    		        case exports.NODE_TYPE.__suspense__:
    		            return "Suspense";
    		        case exports.NODE_TYPE.__portal__:
    		            return "Portal";
    		        case exports.NODE_TYPE.__comment__:
    		            return "Comment";
    		        case exports.NODE_TYPE.__empty__:
    		            return "Empty";
    		        case exports.NODE_TYPE.__null__:
    		            return "Null";
    		        case exports.NODE_TYPE.__text__:
    		            return "Text";
    		        case exports.NODE_TYPE.__function__:
    		            return "Function";
    		        case exports.NODE_TYPE.__class__:
    		            return "Class";
    		        case exports.NODE_TYPE.__plain__:
    		            return "Plain";
    		        case exports.NODE_TYPE.__initial__:
    		            return "Initial";
    		        case exports.NODE_TYPE.__context__:
    		            return "Context";
    		        case exports.NODE_TYPE.__scopeLazy__:
    		            return "ScopeLazy";
    		        case exports.NODE_TYPE.__scopeSuspense__:
    		            return "ScopeSuspense";
    		        case exports.NODE_TYPE.__activity__:
    		            return "Activity";
    		        default:
    		            return "";
    		    }
    		};
    		var getFiberTag = function (node) {
    		    var t = node.t;
    		    var tag = [];
    		    if (t & exports.NODE_TYPE.__memo__) {
    		        tag.push("memo");
    		    }
    		    if (t & exports.NODE_TYPE.__forwardRef__) {
    		        tag.push("forwardRef");
    		    }
    		    if (t & exports.NODE_TYPE.__lazy__) {
    		        tag.push("lazy");
    		    }
    		    if (node.m) {
    		        tag.push("compiler ✨");
    		    }
    		    return tag;
    		};
    		var getFiberType = function (fiber) {
    		    var _a;
    		    var t = fiber.type;
    		    var hasCompiler = false;
    		    // check react compiler
    		    (_a = fiber.hookList) === null || _a === void 0 ? void 0 : _a.listToFoot(function (l) {
    		        var _a;
    		        if (hasCompiler)
    		            return;
    		        if (l.type === reactShared.HOOK_TYPE.useMemo && ((_a = l.result) === null || _a === void 0 ? void 0 : _a[reactCompilerSymbol])) {
    		            hasCompiler = true;
    		        }
    		    });
    		    return { t: t, hasCompiler: hasCompiler };
    		};
    		var getNameFromRawType = function (rawType) {
    		    if (typeof rawType === "object") {
    		        return rawType.displayName || getNameFromRawType(rawType.render);
    		    }
    		    if (typeof rawType === "function") {
    		        return rawType.displayName || rawType.name || "Anonymous";
    		    }
    		};
    		// SEE @my-react/react-reconciler
    		var getFiberName = function (fiber) {
    		    var typedFiber = fiber;
    		    if (fiber.type & exports.NODE_TYPE.__provider__) {
    		        var typedElementType = fiber.elementType;
    		        var name_1 = typedElementType.Context.displayName;
    		        return "".concat(name_1 || "Context", ".Provider");
    		    }
    		    if (fiber.type & exports.NODE_TYPE.__context__) {
    		        var typedElementType = fiber.elementType;
    		        var name_2 = typedElementType.displayName;
    		        return "".concat(name_2 || "Context");
    		    }
    		    if (fiber.type & exports.NODE_TYPE.__consumer__) {
    		        var typedElementType = fiber.elementType;
    		        var name_3 = typedElementType.Context.displayName;
    		        return "".concat(name_3 || "Context", ".Consumer");
    		    }
    		    if (fiber.type & exports.NODE_TYPE.__lazy__) {
    		        var typedElementType = fiber.elementType;
    		        var typedRender = typedElementType === null || typedElementType === void 0 ? void 0 : typedElementType.render;
    		        var name_4 = (typedRender === null || typedRender === void 0 ? void 0 : typedRender.displayName) || (typedRender === null || typedRender === void 0 ? void 0 : typedRender.name) || "";
    		        var element = typedFiber._debugElement;
    		        var type = element === null || element === void 0 ? void 0 : element.type;
    		        name_4 = (type === null || type === void 0 ? void 0 : type.displayName) || name_4;
    		        return "".concat(name_4 || "Anonymous");
    		    }
    		    if (fiber.type & exports.NODE_TYPE.__portal__)
    		        return "Portal";
    		    if (fiber.type & exports.NODE_TYPE.__null__)
    		        return "Null";
    		    if (fiber.type & exports.NODE_TYPE.__empty__)
    		        return "Empty";
    		    if (fiber.type & exports.NODE_TYPE.__scope__)
    		        return "Scope";
    		    if (fiber.type & exports.NODE_TYPE.__scopeLazy__)
    		        return "ScopeLazy";
    		    if (fiber.type & exports.NODE_TYPE.__scopeSuspense__)
    		        return "ScopeSuspense";
    		    if (fiber.type & exports.NODE_TYPE.__activity__)
    		        return "Activity";
    		    if (fiber.type & exports.NODE_TYPE.__strict__)
    		        return "Strict";
    		    if (fiber.type & exports.NODE_TYPE.__profiler__)
    		        return "Profiler";
    		    if (fiber.type & exports.NODE_TYPE.__suspense__)
    		        return "Suspense";
    		    if (fiber.type & exports.NODE_TYPE.__comment__)
    		        return "Comment";
    		    if (fiber.type & exports.NODE_TYPE.__internal__)
    		        return "KEEP\u2014\u2014Internal";
    		    if (fiber.type & exports.NODE_TYPE.__fragment__)
    		        return "Fragment";
    		    if (fiber.type & exports.NODE_TYPE.__text__)
    		        return "text";
    		    if (typeof fiber.elementType === "string")
    		        return "".concat(fiber.elementType);
    		    if (typeof fiber.elementType === "function") {
    		        var typedElementType = fiber.elementType;
    		        var name_5 = typedElementType.displayName || typedElementType.name || "Anonymous";
    		        var element = typedFiber._debugElement;
    		        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    		        // @ts-ignore
    		        var rawType = typedFiber.elementRawType;
    		        var type = ((element === null || element === void 0 ? void 0 : element.type) || rawType);
    		        name_5 = getNameFromRawType(type) || name_5;
    		        return "".concat(name_5);
    		    }
    		    return "unknown";
    		};
    		// SEE @my-react/react-reconciler
    		var isValidElement = function (element) {
    		    return typeof element === "object" && !Array.isArray(element) && element !== null && (element === null || element === void 0 ? void 0 : element[reactShared.TYPEKEY]) === reactShared.Element;
    		};
    		// SEE @my-react/react-reconciler
    		var getMockFiberFromElement = function (element) {
    		    var _a, _b, _c, _d, _e;
    		    var nodeType = exports.NODE_TYPE.__initial__;
    		    var elementType = element.type;
    		    var finalElement = element;
    		    var pendingProps = element.props;
    		    var ref = (_a = element.ref) !== null && _a !== void 0 ? _a : undefined;
    		    var key = (_b = element.key) !== null && _b !== void 0 ? _b : undefined;
    		    if (typeof elementType === "object" && elementType !== null) {
    		        var typedElementType = elementType;
    		        switch (typedElementType[reactShared.TYPEKEY]) {
    		            case reactShared.Provider:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__provider__);
    		                break;
    		            // support react 19 context api
    		            case reactShared.Context:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__context__);
    		                break;
    		            case reactShared.Consumer:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__consumer__);
    		                break;
    		            case reactShared.Memo:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__memo__);
    		                elementType = typedElementType.render;
    		                break;
    		            case reactShared.ForwardRef:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__forwardRef__);
    		                elementType = typedElementType.render;
    		                break;
    		            case reactShared.Lazy:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__lazy__);
    		                break;
    		            default:
    		                throw new Error("[@my-react/react] invalid object element type \"".concat((_c = typedElementType[reactShared.TYPEKEY]) === null || _c === void 0 ? void 0 : _c.toString(), "\""));
    		        }
    		        if (typeof elementType === "object") {
    		            if (elementType[reactShared.TYPEKEY] === reactShared.ForwardRef) {
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__forwardRef__);
    		                elementType = elementType.render;
    		            }
    		            if (elementType[reactShared.TYPEKEY] === reactShared.Provider) {
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__provider__);
    		            }
    		            if (elementType[reactShared.TYPEKEY] === reactShared.Context) {
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__context__);
    		            }
    		            if (elementType[reactShared.TYPEKEY] === reactShared.Consumer) {
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__consumer__);
    		            }
    		        }
    		        if (typeof elementType === "function") {
    		            if ((_d = elementType.prototype) === null || _d === void 0 ? void 0 : _d.isMyReactComponent) {
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__class__);
    		            }
    		            else {
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__function__);
    		            }
    		        }
    		    }
    		    else if (typeof elementType === "function") {
    		        if ((_e = elementType.prototype) === null || _e === void 0 ? void 0 : _e.isMyReactComponent) {
    		            nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__class__);
    		        }
    		        else {
    		            nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__function__);
    		        }
    		    }
    		    else if (typeof elementType === "symbol") {
    		        switch (elementType) {
    		            case reactShared.Root:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__internal__);
    		                break;
    		            case reactShared.Fragment:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__fragment__);
    		                break;
    		            case reactShared.Strict:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__strict__);
    		                break;
    		            case reactShared.Suspense:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__suspense__);
    		                break;
    		            case reactShared.Scope:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__scope__);
    		                break;
    		            case reactShared.ScopeLazy:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__scopeLazy__);
    		                break;
    		            case reactShared.ScopeSuspense:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__scopeSuspense__);
    		                break;
    		            case reactShared.Comment:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__comment__);
    		                break;
    		            case reactShared.Portal:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__portal__);
    		                break;
    		            case reactShared.Profiler:
    		                nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__profiler__);
    		                break;
    		            default:
    		                throw new Error("[@my-react/react] invalid symbol element type \"".concat(elementType === null || elementType === void 0 ? void 0 : elementType.toString(), "\""));
    		        }
    		    }
    		    else if (typeof elementType === "string") {
    		        nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__plain__);
    		    }
    		    else {
    		        nodeType = reactShared.merge(nodeType, exports.NODE_TYPE.__empty__);
    		    }
    		    var mockFiber = {
    		        type: nodeType,
    		        elementType: elementType,
    		        pendingProps: pendingProps,
    		        key: key,
    		        ref: ref,
    		        _debugElement: finalElement,
    		    };
    		    return mockFiber;
    		};
    		var getElementName = function (element) { return "<".concat(getFiberName(getMockFiberFromElement(element)), " />"); };
    		var getContextName = function (value) {
    		    return value.displayName || "Context";
    		};

    		// SEE https://github.com/MrWangJustToDo/reactivity-store
    		// -- reactivity-store utils --
    		var ReactiveFlags;
    		(function (ReactiveFlags) {
    		    ReactiveFlags["SKIP"] = "__v_skip";
    		    ReactiveFlags["IS_REACTIVE"] = "__v_isReactive";
    		    ReactiveFlags["IS_READONLY"] = "__v_isReadonly";
    		    ReactiveFlags["IS_SHALLOW"] = "__v_isShallow";
    		    ReactiveFlags["RAW"] = "__v_raw";
    		    ReactiveFlags["IS_REF"] = "__v_isRef";
    		})(ReactiveFlags || (ReactiveFlags = {}));
    		function isReactive(value) {
    		    if (isReadonly(value)) {
    		        return isReactive(value[ReactiveFlags.RAW]);
    		    }
    		    return !!(value && value[ReactiveFlags.IS_REACTIVE]);
    		}
    		function isReadonly(value) {
    		    return !!(value && value[ReactiveFlags.IS_READONLY]);
    		}
    		function isShallow(value) {
    		    return !!(value && value[ReactiveFlags.IS_SHALLOW]);
    		}
    		function isProxy(value) {
    		    return value ? !!value[ReactiveFlags.RAW] : false;
    		}
    		function isRef(r) {
    		    return r ? r[ReactiveFlags.IS_REF] === true : false;
    		}

    		var isInBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
    		var emptyConstructor = {}.constructor;
    		var id = 1;
    		var idToValueMap = new Map();
    		var valueToIdMap = new Map();
    		var getType = function (value) {
    		    if (isValidElement(value)) {
    		        return "ReactElement";
    		    }
    		    if (isInBrowser && value && value instanceof Element) {
    		        return "Element";
    		    }
    		    var type = Object.prototype.toString.call(value).slice(8, -1);
    		    if (type === "Object" && typeof value[Symbol.iterator] === "function") {
    		        return "Iterable";
    		    }
    		    if (type === "Custom" && value.constructor !== Object && value instanceof Object) {
    		        // For projects implementing objects overriding `.prototype[Symbol.toStringTag]`
    		        return "Object";
    		    }
    		    return type;
    		};
    		var getWrapperType = function (value) {
    		    if (isReadonly(value)) {
    		        return "Readonly";
    		    }
    		    if (isShallow(value)) {
    		        return "Shallow";
    		    }
    		    if (isReactive(value)) {
    		        return "Reactive";
    		    }
    		    if (isRef(value)) {
    		        return "Ref";
    		    }
    		};
    		var isObject = function (value) {
    		    return (value !== "String" &&
    		        value !== "Number" &&
    		        value !== "Boolean" &&
    		        value !== "Null" &&
    		        value !== "Undefined" &&
    		        value !== "Function" &&
    		        value !== "AsyncFunction" &&
    		        value !== "GeneratorFunction" &&
    		        value !== "Symbol" &&
    		        value !== "RegExp" &&
    		        value !== "Promise" &&
    		        value !== "Element" &&
    		        value !== "WeakMap" &&
    		        value !== "WeakSet");
    		};
    		var getTargetNode = function (value, type, deep) {
    		    if (deep === void 0) { deep = 3; }
    		    var existId = valueToIdMap.get(value);
    		    var wrapperType = getWrapperType(value);
    		    var currentId = existId || id++;
    		    var n = undefined;
    		    if (type === "Object" && typeof (value === null || value === void 0 ? void 0 : value.constructor) === "function" && value.constructor !== emptyConstructor && value.constructor.name) {
    		        n = value.constructor.name;
    		    }
    		    if (type === "ReactElement") {
    		        n = getElementName(value);
    		    }
    		    idToValueMap.set(currentId, value);
    		    valueToIdMap.set(value, currentId);
    		    // full deep to load
    		    if (deep === 0) {
    		        return {
    		            i: currentId,
    		            t: type,
    		            _t: wrapperType,
    		            n: n,
    		            v: undefined,
    		            e: true,
    		            l: false,
    		        };
    		    }
    		    else {
    		        if (type === "Array") {
    		            return {
    		                i: currentId,
    		                t: type,
    		                _t: wrapperType,
    		                v: value.map(function (val) { return getNode(val, deep - 1); }),
    		                e: true,
    		            };
    		        }
    		        else if (type === "Iterable") {
    		            return {
    		                i: currentId,
    		                t: type,
    		                _t: wrapperType,
    		                v: Array.from(value).map(function (val) { return getNode(val, deep - 1); }),
    		                e: true,
    		            };
    		        }
    		        else if (type === "Map") {
    		            return {
    		                i: currentId,
    		                t: type,
    		                _t: wrapperType,
    		                v: Array.from(value.entries()).map(function (_a) {
    		                    var key = _a[0], val = _a[1];
    		                    return ({
    		                        t: "Array",
    		                        e: true,
    		                        v: [getNode(key, deep - 1), getNode(val, deep - 1)],
    		                    });
    		                }),
    		                e: true,
    		            };
    		        }
    		        else if (type === "Set") {
    		            return {
    		                i: currentId,
    		                t: type,
    		                _t: wrapperType,
    		                v: Array.from(value).map(function (val) { return getNode(val, deep - 1); }),
    		                e: true,
    		            };
    		        }
    		        else if (type === "Object") {
    		            return {
    		                i: currentId,
    		                t: type,
    		                _t: wrapperType,
    		                n: n,
    		                v: Object.keys(value).reduce(function (acc, key) {
    		                    acc[key] = getNode(value[key], deep - 1);
    		                    return acc;
    		                }, {}),
    		                e: true,
    		            };
    		        }
    		        else if (type === "ReactElement") {
    		            return {
    		                i: currentId,
    		                t: type,
    		                _t: wrapperType,
    		                n: n,
    		                v: Object.keys(value).reduce(function (acc, key) {
    		                    acc[key] = getNode(value[key], deep - 1);
    		                    return acc;
    		                }, {}),
    		                e: true,
    		            };
    		        }
    		        else {
    		            return {
    		                i: currentId,
    		                t: type,
    		                _t: wrapperType || "Object",
    		                n: n,
    		                v: getAllKeys(value).reduce(function (acc, key) {
    		                    acc[key] = getNode(value[key], deep - 1);
    		                    return acc;
    		                }, {}),
    		                e: true,
    		            };
    		        }
    		    }
    		};
    		var getAllKeys = function (data) {
    		    if (!data)
    		        return [];
    		    var keys = [];
    		    for (var key in data) {
    		        keys.push(key);
    		    }
    		    return keys;
    		};
    		var getNode = function (value, deep) {
    		    if (deep === void 0) { deep = 3; }
    		    try {
    		        var type = getType(value);
    		        var expandable = isObject(type);
    		        if (type === "Promise" && (value.status === "fulfilled" || value.status === "rejected")) {
    		            expandable = true;
    		        }
    		        if (expandable) {
    		            // full deep to load
    		            return getTargetNode(value, type, deep);
    		        }
    		        else {
    		            var wrapperType = getWrapperType(value);
    		            var existId = valueToIdMap.get(value);
    		            var currentId = existId || id++;
    		            idToValueMap.set(currentId, value);
    		            valueToIdMap.set(value, currentId);
    		            if (type === "Element") {
    		                return {
    		                    i: currentId,
    		                    t: type,
    		                    _t: wrapperType,
    		                    v: "<".concat(value.tagName.toLowerCase(), " />"),
    		                    e: expandable,
    		                };
    		            }
    		            if (type === "Error") {
    		                return {
    		                    i: currentId,
    		                    t: type,
    		                    _t: wrapperType,
    		                    v: value.message,
    		                    e: expandable,
    		                };
    		            }
    		            if (typeof value === "object" && value !== null) {
    		                return {
    		                    i: currentId,
    		                    t: type,
    		                    _t: wrapperType,
    		                    v: Object.prototype.toString.call(value),
    		                    e: expandable,
    		                };
    		            }
    		            else {
    		                return {
    		                    i: currentId,
    		                    t: type,
    		                    _t: wrapperType,
    		                    v: String(value),
    		                    e: expandable,
    		                };
    		            }
    		        }
    		    }
    		    catch (e) {
    		        return {
    		            i: NaN,
    		            t: "ReadError",
    		            v: "Read data error: " + e.message,
    		            e: false,
    		        };
    		    }
    		};
    		var getNodeFromId = function (id) {
    		    var value = idToValueMap.get(id);
    		    if (value) {
    		        return getNode(value);
    		    }
    		};
    		var getValueFromId = function (id) {
    		    if (id && !Number.isNaN(id)) {
    		        return { v: idToValueMap.get(id), f: true };
    		    }
    		    else {
    		        return { v: undefined, f: false };
    		    }
    		};

    		var getSource = function (fiber) {
    		    if (fiber._debugElement) {
    		        var element = fiber._debugElement;
    		        return element._source;
    		    }
    		    return null;
    		};
    		var getTree$1 = function (fiber) {
    		    var tree = [];
    		    var current = fiber;
    		    var parent = current === null || current === void 0 ? void 0 : current.parent;
    		    while (parent) {
    		        var plain = getPlainNodeByFiber(parent);
    		        var id = plain.i;
    		        tree.push(id);
    		        current = parent;
    		        parent = parent.parent;
    		    }
    		    if (current) {
    		        var typedCurrent = current;
    		        var dispatch = typedCurrent.renderDispatch;
    		        if (dispatch && dispatch.renderMode) {
    		            var packageName = (dispatch === null || dispatch === void 0 ? void 0 : dispatch.renderPackage) || "@my-react";
    		            tree.push("$$ ".concat(packageName, " ").concat(dispatch.renderMode));
    		        }
    		        if (dispatch && dispatch.version) {
    		            if (dispatch.dispatcher) {
    		                tree.push("$$ @my-react ".concat(dispatch.version));
    		            }
    		            else {
    		                tree.push("$$ @my-react legacy ".concat(dispatch.version));
    		            }
    		        }
    		        else {
    		            tree.push("$$ @my-react legacy");
    		        }
    		    }
    		    return tree;
    		};
    		var getProps = function (fiber) {
    		    return getNode(fiber.pendingProps);
    		};
    		var getState = function (fiber) {
    		    return getNode(fiber.pendingState);
    		};

    		var editorReducer = function (state, action) {
    		    return typeof action === "function" ? action(state) : action;
    		};
    		var updateFiberByHook = function (fiber, params) {
    		    var _a, _b, _c;
    		    if (typeof params.hookIndex !== "number")
    		        return "params not valid";
    		    var hookNode = (_c = (_b = (_a = fiber.hookList) === null || _a === void 0 ? void 0 : _a.toArray) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c[params.hookIndex];
    		    if (!hookNode)
    		        return "hook not found";
    		    var nodeId = Number(params.id);
    		    var parentId = Number(params.parentId);
    		    var rootId = Number(params.rootId);
    		    var currentData = getValueFromId(nodeId);
    		    var parentData = getValueFromId(parentId);
    		    var rootData = getValueFromId(rootId);
    		    if (!currentData.f)
    		        return "current hook state not exist";
    		    var currentDataType = typeof currentData.v;
    		    if (!parentData.f && currentDataType !== "boolean" && currentDataType !== "number" && currentDataType !== "string")
    		        return "current hook state is not primitive";
    		    var newVal = currentDataType === "boolean" ? (params.newVal === "true" ? true : false) : currentDataType === "number" ? Number(params.newVal) : params.newVal;
    		    // 更新成功
    		    if (!parentData.f) {
    		        var hookInstance = hookNode;
    		        // oldVersion, not full support
    		        if (hookInstance._dispatch) {
    		            hookInstance._dispatch(newVal);
    		        }
    		        else {
    		            hookInstance._update({ payLoad: function () { return newVal; }, reducer: editorReducer, isForce: true });
    		        }
    		        return;
    		    }
    		    if (parentData.f && !rootData.f) {
    		        return "root hook state not exist";
    		    }
    		    // const parentDataValue = parentData.v;
    		    // shallow update
    		    if (parentData.v === rootData.v) {
    		        var newPayLoad_1 = Object.assign({}, rootData.v);
    		        newPayLoad_1[params.path] = newVal;
    		        var hookInstance = hookNode;
    		        if (hookInstance._dispatch) {
    		            hookInstance._update({ isForce: true });
    		        }
    		        else {
    		            hookInstance._update({ payLoad: function () { return newPayLoad_1; }, reducer: editorReducer, isForce: true });
    		        }
    		    }
    		    else {
    		        // deep update
    		        var newPayLoad_2 = Object.assign({}, rootData.v);
    		        parentData.v[params.path] = newVal;
    		        var hookInstance = hookNode;
    		        if (hookInstance._dispatch) {
    		            hookInstance._update({ isForce: true });
    		        }
    		        else {
    		            hookInstance._update({ payLoad: function () { return newPayLoad_2; }, reducer: editorReducer, isForce: true });
    		        }
    		    }
    		};
    		var updateFiberByProps = function (fiber, params) {
    		    var nodeId = Number(params.id);
    		    var parentId = Number(params.parentId);
    		    var currentData = getValueFromId(nodeId);
    		    var parentData = getValueFromId(parentId);
    		    if (!currentData.f)
    		        return "current props not exist";
    		    var currentDataType = typeof currentData.v;
    		    var newVal = currentDataType === "boolean" ? (params.newVal === "true" ? true : false) : currentDataType === "number" ? Number(params.newVal) : params.newVal;
    		    // deep props update
    		    if (parentData.f) {
    		        var newProps = Object.assign({}, fiber.pendingProps);
    		        parentData.v[params.path] = newVal;
    		        fiber.pendingProps = newProps;
    		        fiber._update(reactShared.STATE_TYPE.__triggerSyncForce__);
    		    }
    		    else {
    		        // shallow props update
    		        var newProps = Object.assign({}, fiber.pendingProps);
    		        newProps[params.path] = newVal;
    		        fiber.pendingProps = newProps;
    		        fiber._update(reactShared.STATE_TYPE.__triggerSyncForce__);
    		    }
    		};
    		var updateFiberByState = function (fiber, params) {
    		    var nodeId = Number(params.id);
    		    var parentId = Number(params.parentId);
    		    var currentData = getValueFromId(nodeId);
    		    var parentData = getValueFromId(parentId);
    		    if (!currentData.f)
    		        return "current state not exist";
    		    var currentDataType = typeof currentData.v;
    		    var newVal = currentDataType === "boolean" ? (params.newVal === "true" ? true : false) : currentDataType === "number" ? Number(params.newVal) : params.newVal;
    		    // deep state update
    		    if (parentData.f) {
    		        var typedInstance = fiber.instance;
    		        var newState = Object.assign({}, typedInstance.state);
    		        parentData.v[params.path] = newVal;
    		        typedInstance.setState(newState);
    		    }
    		    else {
    		        // shallow state update
    		        var typedInstance = fiber.instance;
    		        var newState = Object.assign({}, typedInstance.state);
    		        newState[params.path] = newVal;
    		        typedInstance.setState(newState);
    		    }
    		};
    		var updateFiberNode = function (fiber, params) {
    		    try {
    		        if (params.type === "state") {
    		            return updateFiberByState(fiber, params);
    		        }
    		        if (params.type === "hook") {
    		            return updateFiberByHook(fiber, params);
    		        }
    		        if (params.type === "props") {
    		            return updateFiberByProps(fiber, params);
    		        }
    		        return "type not valid";
    		    }
    		    catch (e) {
    		        return e.message;
    		    }
    		};

    		var getHMRState = function (dispatch) {
    		    return dispatch === null || dispatch === void 0 ? void 0 : dispatch["$$hasRefreshInject"];
    		};
    		var getHMRInternal = function (dispatch, type) {
    		    var _a, _b;
    		    return (_b = (_a = dispatch === null || dispatch === void 0 ? void 0 : dispatch.__dev_refresh_runtime__) === null || _a === void 0 ? void 0 : _a.getSignatureByType) === null || _b === void 0 ? void 0 : _b.call(_a, type);
    		};
    		var getHMRInternalFromId = function (id) {
    		    var fiber = getFiberNodeById(id.toString());
    		    var dispatch = getDispatchFromFiber(fiber);
    		    var hmrEnabled = getHMRState(dispatch);
    		    if (!hmrEnabled)
    		        return;
    		    if (dispatch && fiber && reactShared.include(fiber.type, reactShared.merge(exports.NODE_TYPE.__function__, exports.NODE_TYPE.__class__))) {
    		        return getHMRInternal(dispatch, fiber.elementType);
    		    }
    		};

    		/**
    		 * Copyright (c) Meta Platforms, Inc. and affiliates.
    		 *
    		 * This source code is licensed under the MIT license found in the
    		 * LICENSE file in the root directory of this source tree.
    		 *
    		 */
    		// This is a DevTools fork of shared/ConsolePatchingDev.
    		// The shared console patching code is DEV-only.
    		// We can't use it since DevTools only ships production builds.
    		// Helpers to patch console.logs to avoid logging during side-effect free
    		// replaying on render function. This currently only patches the object
    		// lazily which won't cover if the log function was extracted eagerly.
    		// We could also eagerly patch the method.
    		var disabledDepth = 0;
    		var prevLog;
    		var prevInfo;
    		var prevWarn;
    		var prevError;
    		var prevGroup;
    		var prevGroupCollapsed;
    		var prevGroupEnd;
    		function disabledLog() { }
    		disabledLog.__reactDisabledLog = true;
    		function disableLogs() {
    		    if (disabledDepth === 0) {
    		        prevLog = console.log;
    		        prevInfo = console.info;
    		        prevWarn = console.warn;
    		        prevError = console.error;
    		        prevGroup = console.group;
    		        prevGroupCollapsed = console.groupCollapsed;
    		        prevGroupEnd = console.groupEnd;
    		        // https://github.com/facebook/react/issues/19099
    		        var props = {
    		            configurable: true,
    		            enumerable: true,
    		            value: disabledLog,
    		            writable: true,
    		        };
    		        // $FlowFixMe[cannot-write] Flow thinks console is immutable.
    		        Object.defineProperties(console, {
    		            info: props,
    		            log: props,
    		            warn: props,
    		            error: props,
    		            group: props,
    		            groupCollapsed: props,
    		            groupEnd: props,
    		        });
    		    }
    		    disabledDepth++;
    		}
    		function reenableLogs() {
    		    disabledDepth--;
    		    if (disabledDepth === 0) {
    		        var props = {
    		            configurable: true,
    		            enumerable: true,
    		            writable: true,
    		        };
    		        // $FlowFixMe[cannot-write] Flow thinks console is immutable.
    		        Object.defineProperties(console, {
    		            log: __assign(__assign({}, props), { value: prevLog }),
    		            info: __assign(__assign({}, props), { value: prevInfo }),
    		            warn: __assign(__assign({}, props), { value: prevWarn }),
    		            error: __assign(__assign({}, props), { value: prevError }),
    		            group: __assign(__assign({}, props), { value: prevGroup }),
    		            groupCollapsed: __assign(__assign({}, props), { value: prevGroupCollapsed }),
    		            groupEnd: __assign(__assign({}, props), { value: prevGroupEnd }),
    		        });
    		    }
    		    if (disabledDepth < 0) {
    		        console.error('disabledDepth fell below zero. ' +
    		            'This is a bug in React. Please file an issue.');
    		    }
    		}

    		// https://github.com/facebook/react/blob/main/packages/react-debug-tools/src/ReactDebugHooks.js
    		/* eslint-disable @typescript-eslint/no-unused-vars */
    		/* eslint-disable max-lines */
    		/* eslint-disable @typescript-eslint/ban-ts-comment */
    		var hookLog = [];
    		var primitiveStackCache = null;
    		function getPrimitiveStackCache() {
    		    var _a, _b;
    		    // This initializes a cache of all primitive hooks so that the top
    		    // most stack frames added by calling the primitive hook can be removed.
    		    if (primitiveStackCache === null) {
    		        var cache = new Map();
    		        var readHookLog = void 0;
    		        try {
    		            // Use all hooks here to add them to the hook log.
    		            Dispatcher.useContext((_a = {}, _a[reactShared.TYPEKEY] = reactShared.Context, _a.Provider = { value: null }, _a));
    		            Dispatcher.useState(null);
    		            Dispatcher.useReducer(function (s, a) { return s; }, null);
    		            Dispatcher.useRef(null);
    		            Dispatcher.useLayoutEffect(function () { });
    		            Dispatcher.useInsertionEffect(function () { });
    		            Dispatcher.useEffect(function () { });
    		            Dispatcher.useOptimistic(null, function (s, a) { return s; });
    		            Dispatcher.useImperativeHandle(undefined, function () { return null; });
    		            Dispatcher.useDebugValue(null, function () { });
    		            Dispatcher.useCallback(function () { });
    		            Dispatcher.useTransition();
    		            Dispatcher.useSyncExternalStore(function () { return function () { }; }, function () { return null; }, function () { return null; });
    		            Dispatcher.useDeferredValue(null);
    		            Dispatcher.useMemo(function () { return null; });
    		            if (typeof Dispatcher.use === "function") {
    		                Dispatcher.use((_b = {}, _b[reactShared.TYPEKEY] = reactShared.Context, _b.Provider = { value: null }, _b));
    		                Dispatcher.use({
    		                    then: function () { },
    		                    state: "fulfilled",
    		                    value: null,
    		                });
    		                try {
    		                    Dispatcher.use({
    		                        then: function () { },
    		                    });
    		                }
    		                catch (x) {
    		                    void 0;
    		                }
    		            }
    		            Dispatcher.useSignal(null);
    		            Dispatcher.useId();
    		        }
    		        finally {
    		            readHookLog = hookLog;
    		            hookLog = [];
    		        }
    		        for (var i = 0; i < readHookLog.length; i++) {
    		            var hook = readHookLog[i];
    		            cache.set(hook.primitive, ErrorStackParser.parse(hook.stackError));
    		        }
    		        primitiveStackCache = cache;
    		    }
    		    return primitiveStackCache;
    		}
    		var currentFiber = null;
    		var currentHookNode = null;
    		function nextHook() {
    		    var hook = currentHookNode;
    		    if (hook !== null) {
    		        currentHookNode = currentHookNode.next;
    		    }
    		    return hook === null || hook === void 0 ? void 0 : hook.value;
    		}
    		var defaultGetContextFiber = function (fiber, ContextObject) {
    		    if ((fiber === null || fiber === void 0 ? void 0 : fiber.parent) && ContextObject) {
    		        var parent_1 = fiber.parent;
    		        while (parent_1) {
    		            if (reactShared.include(parent_1.type, exports.NODE_TYPE.__provider__)) {
    		                var typedElementType = parent_1.elementType;
    		                var contextObj = typedElementType["Context"];
    		                if (contextObj === ContextObject) {
    		                    return parent_1;
    		                }
    		            }
    		            if (reactShared.include(parent_1.type, exports.NODE_TYPE.__context__)) {
    		                var typedElementType = parent_1.elementType;
    		                var contextObj = typedElementType;
    		                if (contextObj === ContextObject) {
    		                    return parent_1;
    		                }
    		            }
    		            parent_1 = parent_1.parent;
    		        }
    		    }
    		    else {
    		        return null;
    		    }
    		};
    		var defaultGetContextValue = function (fiber, ContextObject) {
    		    if (fiber) {
    		        return fiber.pendingProps["value"];
    		    }
    		    else {
    		        return ContextObject === null || ContextObject === void 0 ? void 0 : ContextObject.Provider["value"];
    		    }
    		};
    		function readContext(context) {
    		    if (currentFiber === null) {
    		        return context.Provider.value;
    		    }
    		    else {
    		        var fiber = defaultGetContextFiber(currentFiber, context);
    		        var value = defaultGetContextValue(fiber, context);
    		        return value;
    		    }
    		}
    		var SuspenseException = new Error("Suspense Exception: This is not a real error! It's an implementation " +
    		    "detail of `use` to interrupt the current render. You must either " +
    		    "rethrow it immediately, or move the `use` call outside of the " +
    		    "`try/catch` block. Capturing without rethrowing will lead to " +
    		    "unexpected behavior.\n\n" +
    		    "To handle async errors, wrap your component in an error boundary, or " +
    		    "call the promise's `.catch` method and pass the result to `use`.");
    		function use(usable) {
    		    if (usable !== null && typeof usable === "object") {
    		        if (typeof usable.then === "function") {
    		            var thenable = usable;
    		            // new version of @my-react change the `state` to `status`
    		            var field = thenable.state || thenable.status;
    		            switch (field) {
    		                case "fulfilled": {
    		                    var fulfilledValue = thenable.value;
    		                    hookLog.push({
    		                        displayName: null,
    		                        primitive: "Promise",
    		                        stackError: new Error(),
    		                        value: fulfilledValue,
    		                        dispatcherHookName: "Use",
    		                    });
    		                    return fulfilledValue;
    		                }
    		                case "rejected": {
    		                    var rejectedError = thenable.reason;
    		                    throw rejectedError;
    		                }
    		            }
    		            // If this was an uncached Promise we have to abandon this attempt
    		            // but we can still emit anything up until this point.
    		            hookLog.push({
    		                displayName: null,
    		                primitive: "Unresolved",
    		                stackError: new Error(),
    		                value: thenable,
    		                dispatcherHookName: "Use",
    		            });
    		            throw SuspenseException;
    		        }
    		        else if (usable[reactShared.TYPEKEY] === reactShared.Context) {
    		            var context = usable;
    		            var value = readContext(context);
    		            hookLog.push({
    		                displayName: context.displayName || "Context",
    		                primitive: "Context (use)",
    		                stackError: new Error(),
    		                value: value,
    		                dispatcherHookName: "Use",
    		            });
    		            return value;
    		        }
    		    }
    		    throw new Error("An unsupported type was passed to use(): " + String(usable));
    		}
    		function useContext(context) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useContext) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var value = readContext(context);
    		    hookLog.push({
    		        displayName: context.displayName || null,
    		        primitive: "Context",
    		        stackError: new Error(),
    		        value: value,
    		        dispatcherHookName: "Context",
    		    });
    		    return value;
    		}
    		function useState(initialState) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useState) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var typedInitialState = initialState;
    		    var state = hook ? hook.result : typeof initialState === "function" ? typedInitialState() : initialState;
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "State",
    		        stackError: new Error(),
    		        value: state,
    		        dispatcherHookName: "State",
    		    });
    		    return [state, function (action) { }];
    		}
    		function useReducer(reducer, initialArg, init) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useReducer) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var state = hook ? hook.result : init !== undefined ? init(initialArg) : initialArg;
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Reducer",
    		        stackError: new Error(),
    		        value: state,
    		        dispatcherHookName: "Reducer",
    		    });
    		    return [state, function (action) { }];
    		}
    		function useRef(initialValue) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useRef) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var ref = hook ? hook.result : { current: initialValue };
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Ref",
    		        stackError: new Error(),
    		        value: ref.current,
    		        dispatcherHookName: "Ref",
    		    });
    		    return ref;
    		}
    		function useLayoutEffect(create, inputs) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useLayoutEffect) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "LayoutEffect",
    		        stackError: new Error(),
    		        value: create,
    		        dispatcherHookName: "LayoutEffect",
    		    });
    		}
    		function useInsertionEffect(create, inputs) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useInsertionEffect) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "InsertionEffect",
    		        stackError: new Error(),
    		        value: create,
    		        dispatcherHookName: "InsertionEffect",
    		    });
    		}
    		function useEffect(create, deps) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useEffect) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Effect",
    		        stackError: new Error(),
    		        value: create,
    		        dispatcherHookName: "Effect",
    		    });
    		}
    		function useImperativeHandle(ref, create, inputs) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useImperativeHandle) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    // We don't actually store the instance anywhere if there is no ref callback
    		    // and if there is a ref callback it might not store it but if it does we
    		    // have no way of knowing where. So let's only enable introspection of the
    		    // ref itself if it is using the object form.
    		    var instance = undefined;
    		    if (ref !== null && typeof ref === "object") {
    		        instance = ref.current;
    		    }
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "ImperativeHandle",
    		        stackError: new Error(),
    		        value: instance,
    		        dispatcherHookName: "ImperativeHandle",
    		    });
    		}
    		function useDebugValue(value, formatterFn) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useDebugValue) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "DebugValue",
    		        stackError: new Error(),
    		        value: typeof formatterFn === "function" ? formatterFn(value) : value,
    		        dispatcherHookName: "DebugValue",
    		    });
    		}
    		function useCallback(callback, inputs) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useCallback) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var value = hook ? hook.result : callback;
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Callback",
    		        stackError: new Error(),
    		        value: value,
    		        dispatcherHookName: "Callback",
    		    });
    		    return value;
    		}
    		function useMemo(nextCreate, inputs) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useMemo) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var value = hook ? hook.result : nextCreate();
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Memo",
    		        stackError: new Error(),
    		        value: value,
    		        dispatcherHookName: "Memo",
    		    });
    		    return value;
    		}
    		function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useSyncExternalStore) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var value = getSnapshot();
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "SyncExternalStore",
    		        stackError: new Error(),
    		        value: value,
    		        dispatcherHookName: "SyncExternalStore",
    		    });
    		    return value;
    		}
    		function useTransition() {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useTransition) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var isPending = hook ? (Array.isArray(hook.result) ? hook.result[0] : hook.result.value) : false;
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Transition",
    		        stackError: new Error(),
    		        value: isPending,
    		        dispatcherHookName: "Transition",
    		    });
    		    return [isPending, function () { }];
    		}
    		function useDeferredValue(value, initialValue) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useDeferredValue) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var prevValue = hook ? hook.result : value;
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "DeferredValue",
    		        stackError: new Error(),
    		        value: prevValue,
    		        dispatcherHookName: "DeferredValue",
    		    });
    		    return prevValue;
    		}
    		function useId() {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useId) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var id = hook ? hook.result : "";
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Id",
    		        stackError: new Error(),
    		        value: id,
    		        dispatcherHookName: "Id",
    		    });
    		    return id;
    		}
    		function useSignal(initial) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useSignal) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var value = hook ? hook.result.getValue : typeof initial === "function" ? initial : function () { return initial; };
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Signal",
    		        stackError: new Error(),
    		        value: value(),
    		        dispatcherHookName: "Signal",
    		    });
    		    return [value, function () { }];
    		}
    		function useOptimistic(passthrough, reducer) {
    		    var _a;
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useOptimistic) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var state = hook ? (_a = hook.result) === null || _a === void 0 ? void 0 : _a.value : passthrough;
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "Optimistic",
    		        stackError: new Error(),
    		        value: state,
    		        dispatcherHookName: "Optimistic",
    		    });
    		    return [state, function (action) { }];
    		}
    		function useEffectEvent(passthrough) {
    		    var hook = nextHook();
    		    if (hook && hook.type !== reactShared.HOOK_TYPE.useEffectEvent) {
    		        throw new Error("Invalid hook type, look like a bug for @my-react/devtools");
    		    }
    		    var state = hook ? hook.result : passthrough;
    		    hookLog.push({
    		        displayName: null,
    		        primitive: "EffectEvent",
    		        stackError: new Error(),
    		        value: state,
    		        dispatcherHookName: "EffectEvent",
    		    });
    		    return state;
    		}
    		var Dispatcher = {
    		    readContext: readContext,
    		    use: use,
    		    useCallback: useCallback,
    		    useContext: useContext,
    		    useEffect: useEffect,
    		    useImperativeHandle: useImperativeHandle,
    		    useLayoutEffect: useLayoutEffect,
    		    useInsertionEffect: useInsertionEffect,
    		    useMemo: useMemo,
    		    useReducer: useReducer,
    		    useRef: useRef,
    		    useState: useState,
    		    useDebugValue: useDebugValue,
    		    useDeferredValue: useDeferredValue,
    		    useTransition: useTransition,
    		    useSyncExternalStore: useSyncExternalStore,
    		    useId: useId,
    		    useSignal: useSignal,
    		    useOptimistic: useOptimistic,
    		    useEffectEvent: useEffectEvent,
    		};
    		// create a proxy to throw a custom error
    		// in case future versions of React adds more hooks
    		var DispatcherProxyHandler = {
    		    get: function (target, prop) {
    		        if (Object.prototype.hasOwnProperty.call(target, prop)) {
    		            return target[prop];
    		        }
    		        var error = new Error("Missing method in Dispatcher: " + prop);
    		        // Note: This error name needs to stay in sync with react-devtools-shared
    		        // TODO: refactor this if we ever combine the devtools and debug tools packages
    		        error.name = "ReactDebugToolsUnsupportedHookError";
    		        throw error;
    		    },
    		};
    		// `Proxy` may not exist on some platforms
    		var DispatcherProxy = typeof Proxy === "undefined" ? Dispatcher : new Proxy(Dispatcher, DispatcherProxyHandler);
    		// Don't assume
    		//
    		// We can't assume that stack frames are nth steps away from anything.
    		// E.g. we can't assume that the root call shares all frames with the stack
    		// of a hook call. A simple way to demonstrate this is wrapping `new Error()`
    		// in a wrapper constructor like a polyfill. That'll add an extra frame.
    		// Similar things can happen with the call to the dispatcher. The top frame
    		// may not be the primitive.
    		//
    		// We also can't assume that the last frame of the root call is the same
    		// frame as the last frame of the hook call because long stack traces can be
    		// truncated to a stack trace limit.
    		var mostLikelyAncestorIndex = 0;
    		function findSharedIndex(hookStack, rootStack, rootIndex) {
    		    var source = rootStack[rootIndex].source;
    		    hookSearch: for (var i = 0; i < hookStack.length; i++) {
    		        if (hookStack[i].source === source) {
    		            // This looks like a match. Validate that the rest of both stack match up.
    		            for (var a = rootIndex + 1, b = i + 1; a < rootStack.length && b < hookStack.length; a++, b++) {
    		                if (hookStack[b].source !== rootStack[a].source) {
    		                    // If not, give up and try a different match.
    		                    continue hookSearch;
    		                }
    		            }
    		            return i;
    		        }
    		    }
    		    return -1;
    		}
    		function findCommonAncestorIndex(rootStack, hookStack) {
    		    var rootIndex = findSharedIndex(hookStack, rootStack, mostLikelyAncestorIndex);
    		    if (rootIndex !== -1) {
    		        return rootIndex;
    		    }
    		    // If the most likely one wasn't a hit, try any other frame to see if it is shared.
    		    // If that takes more than 5 frames, something probably went wrong.
    		    for (var i = 0; i < rootStack.length && i < 5; i++) {
    		        rootIndex = findSharedIndex(hookStack, rootStack, i);
    		        if (rootIndex !== -1) {
    		            mostLikelyAncestorIndex = i;
    		            return rootIndex;
    		        }
    		    }
    		    return -1;
    		}
    		function isReactWrapper(functionName, wrapperName) {
    		    var hookName = parseHookName(functionName);
    		    if (wrapperName === "HostTransitionStatus") {
    		        return hookName === wrapperName || hookName === "FormStatus";
    		    }
    		    return hookName === wrapperName;
    		}
    		function findPrimitiveIndex(hookStack, hook) {
    		    var stackCache = getPrimitiveStackCache();
    		    var primitiveStack = stackCache.get(hook.primitive);
    		    if (primitiveStack === undefined) {
    		        return -1;
    		    }
    		    for (var i = 0; i < primitiveStack.length && i < hookStack.length; i++) {
    		        // Note: there is no guarantee that we will find the top-most primitive frame in the stack
    		        // For React Native (uses Hermes), these source fields will be identical and skipped
    		        if (primitiveStack[i].source !== hookStack[i].source) {
    		            // If the next two frames are functions called `useX` then we assume that they're part of the
    		            // wrappers that the React package or other packages adds around the dispatcher.
    		            if (i < hookStack.length - 1 && isReactWrapper(hookStack[i].functionName, hook.dispatcherHookName)) {
    		                i++;
    		            }
    		            if (i < hookStack.length - 1 && isReactWrapper(hookStack[i].functionName, hook.dispatcherHookName)) {
    		                i++;
    		            }
    		            return i;
    		        }
    		    }
    		    return -1;
    		}
    		function parseTrimmedStack(rootStack, hook) {
    		    // Get the stack trace between the primitive hook function and
    		    // the root function call. I.e. the stack frames of custom hooks.
    		    var hookStack = ErrorStackParser.parse(hook.stackError);
    		    var rootIndex = findCommonAncestorIndex(rootStack, hookStack);
    		    var primitiveIndex = findPrimitiveIndex(hookStack, hook);
    		    if (rootIndex === -1 || primitiveIndex === -1 || rootIndex - primitiveIndex < 2) {
    		        if (primitiveIndex === -1) {
    		            // Something went wrong. Give up.
    		            return [null, null];
    		        }
    		        else {
    		            return [hookStack[primitiveIndex - 1], null];
    		        }
    		    }
    		    return [hookStack[primitiveIndex - 1], hookStack.slice(primitiveIndex, rootIndex - 1)];
    		}
    		function parseHookName(functionName) {
    		    if (!functionName) {
    		        return "";
    		    }
    		    var startIndex = functionName.lastIndexOf("[as ");
    		    if (startIndex !== -1) {
    		        // Workaround for sourcemaps in Jest and Chrome.
    		        // In `node --enable-source-maps`, we don't see "Object.useHostTransitionStatus [as useFormStatus]" but "Object.useFormStatus"
    		        // "Object.useHostTransitionStatus [as useFormStatus]" -> "useFormStatus"
    		        return parseHookName(functionName.slice(startIndex + "[as ".length, -1));
    		    }
    		    startIndex = functionName.lastIndexOf(".");
    		    if (startIndex === -1) {
    		        startIndex = 0;
    		    }
    		    else {
    		        startIndex += 1;
    		    }
    		    if (functionName.slice(startIndex).startsWith("unstable_")) {
    		        startIndex += "unstable_".length;
    		    }
    		    if (functionName.slice(startIndex).startsWith("experimental_")) {
    		        startIndex += "experimental_".length;
    		    }
    		    if (functionName.slice(startIndex, startIndex + 3) === "use") {
    		        if (functionName.length - startIndex === 3) {
    		            return "Use";
    		        }
    		        startIndex += 3;
    		    }
    		    return functionName.slice(startIndex);
    		}
    		function buildTree(rootStack, readHookLog) {
    		    var rootChildren = [];
    		    var prevStack = null;
    		    var levelChildren = rootChildren;
    		    var nativeHookID = 0;
    		    var stackOfChildren = [];
    		    for (var i = 0; i < readHookLog.length; i++) {
    		        var hook = readHookLog[i];
    		        var parseResult = parseTrimmedStack(rootStack, hook);
    		        var primitiveFrame = parseResult[0];
    		        var stack = parseResult[1];
    		        var displayName = hook.displayName;
    		        if (displayName === null && primitiveFrame !== null) {
    		            displayName =
    		                // @ts-ignore
    		                parseHookName(primitiveFrame === null || primitiveFrame === void 0 ? void 0 : primitiveFrame.functionName) ||
    		                    // Older versions of React do not have sourcemaps.
    		                    // In those versions there was always a 1:1 mapping between wrapper and dispatcher method.
    		                    parseHookName(hook.dispatcherHookName);
    		        }
    		        if (stack !== null) {
    		            stack = Array.isArray(stack) ? stack : [stack];
    		            // Note: The indices 0 <= n < length-1 will contain the names.
    		            // The indices 1 <= n < length will contain the source locations.
    		            // That's why we get the name from n - 1 and don't check the source
    		            // of index 0.
    		            var commonSteps = 0;
    		            if (prevStack !== null) {
    		                // Compare the current level's stack to the new stack.
    		                while (commonSteps < stack.length && commonSteps < prevStack.length) {
    		                    var stackSource = stack[stack.length - commonSteps - 1].source;
    		                    var prevSource = prevStack[prevStack.length - commonSteps - 1].source;
    		                    if (stackSource !== prevSource) {
    		                        break;
    		                    }
    		                    commonSteps++;
    		                }
    		                // Pop back the stack as many steps as were not common.
    		                for (var j = prevStack.length - 1; j > commonSteps; j--) {
    		                    // $FlowFixMe[incompatible-type]
    		                    levelChildren = stackOfChildren.pop();
    		                }
    		            }
    		            // The remaining part of the new stack are custom hooks. Push them
    		            // to the tree.
    		            for (var j = stack.length - commonSteps - 1; j >= 1; j--) {
    		                var children = [];
    		                var stackFrame = stack[j];
    		                var levelChild_1 = {
    		                    id: null,
    		                    isStateEditable: false,
    		                    name: parseHookName(stack[j - 1].functionName),
    		                    value: undefined,
    		                    subHooks: children,
    		                    hookSource: {
    		                        lineNumber: stackFrame.lineNumber,
    		                        columnNumber: stackFrame.columnNumber,
    		                        functionName: stackFrame.functionName,
    		                        fileName: stackFrame.fileName,
    		                    },
    		                };
    		                levelChildren.push(levelChild_1);
    		                stackOfChildren.push(levelChildren);
    		                levelChildren = children;
    		            }
    		            prevStack = stack;
    		        }
    		        var primitive = hook.primitive;
    		        var id = nativeHookID++;
    		        // For the time being, only State and Reducer hooks support runtime overrides.
    		        var isStateEditable = primitive === "Reducer" || primitive === "State";
    		        var name_1 = displayName || primitive;
    		        var levelChild = {
    		            id: id,
    		            isStateEditable: isStateEditable,
    		            name: name_1,
    		            value: hook.value,
    		            subHooks: [],
    		            hookSource: null,
    		        };
    		        var hookSource = {
    		            lineNumber: null,
    		            functionName: null,
    		            fileName: null,
    		            columnNumber: null,
    		        };
    		        if (stack && Array.isArray(stack) && stack.length >= 1) {
    		            var stackFrame = stack[0];
    		            hookSource.lineNumber = stackFrame.lineNumber;
    		            hookSource.functionName = stackFrame.functionName;
    		            hookSource.fileName = stackFrame.fileName;
    		            hookSource.columnNumber = stackFrame.columnNumber;
    		        }
    		        levelChild.hookSource = hookSource;
    		        levelChildren.push(levelChild);
    		    }
    		    // Associate custom hook values (useDebugValue() hook entries) with the correct hooks.
    		    processDebugValues(rootChildren, null);
    		    return rootChildren;
    		}
    		// Custom hooks support user-configurable labels (via the special useDebugValue() hook).
    		// That hook adds user-provided values to the hooks tree,
    		// but these values aren't intended to appear alongside of the other hooks.
    		// Instead they should be attributed to their parent custom hook.
    		// This method walks the tree and assigns debug values to their custom hook owners.
    		function processDebugValues(hooksTree, parentHooksNode) {
    		    var debugValueHooksNodes = [];
    		    for (var i = 0; i < hooksTree.length; i++) {
    		        var hooksNode = hooksTree[i];
    		        if (hooksNode.name === "DebugValue" && hooksNode.subHooks.length === 0) {
    		            hooksTree.splice(i, 1);
    		            i--;
    		            debugValueHooksNodes.push(hooksNode);
    		        }
    		        else {
    		            processDebugValues(hooksNode.subHooks, hooksNode);
    		        }
    		    }
    		    // Bubble debug value labels to their custom hook owner.
    		    // If there is no parent hook, just ignore them for now.
    		    // (We may warn about this in the future.)
    		    if (parentHooksNode !== null) {
    		        if (debugValueHooksNodes.length === 1) {
    		            parentHooksNode.value = debugValueHooksNodes[0].value;
    		        }
    		        else if (debugValueHooksNodes.length > 1) {
    		            parentHooksNode.value = debugValueHooksNodes.map(function (_a) {
    		                var value = _a.value;
    		                return value;
    		            });
    		        }
    		    }
    		}
    		function handleRenderFunctionError(error) {
    		    // original error might be any type.
    		    if (error === SuspenseException) {
    		        // An uncached Promise was used. We can't synchronously resolve the rest of
    		        // the Hooks but we can at least show what ever we got so far.
    		        return;
    		    }
    		    if (reactShared.isPromise(error)) {
    		        return;
    		    }
    		    if (error instanceof Error && error.name === "ReactDebugToolsUnsupportedHookError") {
    		        throw error;
    		    }
    		    // If the error is not caused by an unsupported feature, it means
    		    // that the error is caused by user's code in renderFunction.
    		    // In this case, we should wrap the original error inside a custom error
    		    // so that devtools can give a clear message about it.
    		    // @ts-ignore
    		    var wrapperError = new Error("Error rendering inspected component", {
    		        cause: error,
    		    });
    		    // Note: This error name needs to stay in sync with react-devtools-shared
    		    // TODO: refactor this if we ever combine the devtools and debug tools packages
    		    wrapperError.name = "ReactDebugToolsRenderError";
    		    // this stage-4 proposal is not supported by all environments yet.
    		    // @ts-ignore
    		    wrapperError.cause = error;
    		    throw wrapperError;
    		}
    		function inspectHooks(renderFunction, props, currentDispatcher) {
    		    // DevTools will pass the current renderer's injected dispatcher.
    		    // Other apps might compile debug hooks as part of their app though.
    		    currentDispatcher.current.proxy = DispatcherProxy;
    		    var readHookLog;
    		    var ancestorStackError;
    		    try {
    		        ancestorStackError = new Error();
    		        renderFunction(props);
    		    }
    		    catch (error) {
    		        handleRenderFunctionError(error);
    		    }
    		    finally {
    		        readHookLog = hookLog;
    		        hookLog = [];
    		        currentDispatcher.current.proxy = null;
    		    }
    		    var rootStack = ancestorStackError === undefined ? [] : ErrorStackParser.parse(ancestorStackError);
    		    return buildTree(rootStack, readHookLog);
    		}
    		function inspectHooksOfForwardRef(renderFunction, props, ref, currentDispatcher) {
    		    currentDispatcher.current.proxy = DispatcherProxy;
    		    var readHookLog;
    		    var ancestorStackError;
    		    try {
    		        ancestorStackError = new Error();
    		        renderFunction(props, ref);
    		    }
    		    catch (error) {
    		        handleRenderFunctionError(error);
    		    }
    		    finally {
    		        readHookLog = hookLog;
    		        hookLog = [];
    		        currentDispatcher.current.proxy = null;
    		    }
    		    var rootStack = ancestorStackError === undefined ? [] : ErrorStackParser.parse(ancestorStackError);
    		    return buildTree(rootStack, readHookLog);
    		}
    		function inspectHooksOfFiber(fiber, dispatch) {
    		    if (!reactShared.include(fiber.type, exports.NODE_TYPE.__function__)) {
    		        return;
    		    }
    		    // Warm up the cache so that it doesn't consume the currentHook.
    		    getPrimitiveStackCache();
    		    // Set up the current hook so that we can step through and read the
    		    // current state from them.
    		    currentHookNode = fiber.hookList.head;
    		    currentFiber = fiber;
    		    var typedElementType = fiber.elementType;
    		    var props = fiber.memoizedProps;
    		    try {
    		        if (reactShared.include(fiber.type, exports.NODE_TYPE.__forwardRef__)) {
    		            return inspectHooksOfForwardRef(typedElementType, props, fiber.ref, dispatch);
    		        }
    		        else {
    		            return inspectHooks(typedElementType, props, dispatch);
    		        }
    		    }
    		    finally {
    		        currentHookNode = null;
    		        currentFiber = null;
    		    }
    		}

    		var linkStateToHookIndex = new WeakMap();
    		var parseHooksTreeToHOOKTree = function (node, d, p) {
    		    var _p = p || { index: 0 };
    		    return node.map(function (item) {
    		        var id = item.id, name = item.name, value = item.value, subHooks = item.subHooks, isStateEditable = item.isStateEditable;
    		        var isHook = !subHooks || subHooks.length === 0;
    		        var children = subHooks ? parseHooksTreeToHOOKTree(subHooks, d + 1, _p) : undefined;
    		        return {
    		            k: id === null || id === void 0 ? void 0 : id.toString(),
    		            e: isStateEditable,
    		            i: isHook ? _p.index++ : undefined,
    		            n: name || "Anonymous",
    		            v: getNode(value),
    		            d: d,
    		            h: isHook,
    		            c: children,
    		            // all the hooks key
    		            keys: isHook ? [id] : children.map(function (c) { return c.keys; }).flat(),
    		        };
    		    });
    		};
    		var getHookName = function (type) {
    		    switch (type) {
    		        case reactShared.HOOK_TYPE.useReducer:
    		            return "Reducer";
    		        case reactShared.HOOK_TYPE.useEffect:
    		            return "Effect";
    		        case reactShared.HOOK_TYPE.useLayoutEffect:
    		            return "LayoutEffect";
    		        case reactShared.HOOK_TYPE.useMemo:
    		            return "Memo";
    		        case reactShared.HOOK_TYPE.useCallback:
    		            return "Callback";
    		        case reactShared.HOOK_TYPE.useRef:
    		            return "Ref";
    		        case reactShared.HOOK_TYPE.useImperativeHandle:
    		            return "ImperativeHandle";
    		        case reactShared.HOOK_TYPE.useDebugValue:
    		            return "DebugValue";
    		        case reactShared.HOOK_TYPE.useContext:
    		            return "Context";
    		        case reactShared.HOOK_TYPE.useDeferredValue:
    		            return "DeferredValue";
    		        case reactShared.HOOK_TYPE.useTransition:
    		            return "Transition";
    		        case reactShared.HOOK_TYPE.useId:
    		            return "Id";
    		        case reactShared.HOOK_TYPE.useSyncExternalStore:
    		            return "SyncExternalStore";
    		        case reactShared.HOOK_TYPE.useInsertionEffect:
    		            return "InsertionEffect";
    		        case reactShared.HOOK_TYPE.useState:
    		            return "State";
    		        case reactShared.HOOK_TYPE.useSignal:
    		            return "Signal";
    		    }
    		};
    		var getHookNormal = function (fiber) {
    		    var _a;
    		    var final = [];
    		    if (!fiber.hookList)
    		        return final;
    		    var hookList = fiber.hookList;
    		    var processStack = function (hook, index) {
    		        var _a;
    		        var isEffect = hook.type === reactShared.HOOK_TYPE.useEffect || hook.type === reactShared.HOOK_TYPE.useLayoutEffect || hook.type === reactShared.HOOK_TYPE.useInsertionEffect;
    		        var isRef = hook.type === reactShared.HOOK_TYPE.useRef;
    		        var isContext = hook.type === reactShared.HOOK_TYPE.useContext;
    		        final.push({
    		            k: index.toString(),
    		            i: index,
    		            n: isContext ? getContextName(hook.value) : getHookName(hook.type),
    		            v: getNode(isEffect ? hook.value : isRef ? (_a = hook.result) === null || _a === void 0 ? void 0 : _a.current : hook.result),
    		            d: 0,
    		            h: true,
    		            keys: [index],
    		        });
    		    };
    		    (_a = hookList === null || hookList === void 0 ? void 0 : hookList.toArray()) === null || _a === void 0 ? void 0 : _a.forEach(processStack);
    		    return final;
    		};
    		// disable all log
    		var getHookStack = function (fiber, dispatch) {
    		    var final = [];
    		    if (!fiber.hookList)
    		        return final;
    		    disableLogs();
    		    var hookTree = inspectHooksOfFiber(fiber, dispatch.dispatcher);
    		    reenableLogs();
    		    return parseHooksTreeToHOOKTree(hookTree, 0);
    		};
    		var getHook = function (fiber) {
    		    var dispatch = getDispatchFromFiber(fiber);
    		    if (dispatch && dispatch.dispatcher) {
    		        try {
    		            return getHookStack(fiber, dispatch);
    		        }
    		        catch (e) {
    		            console.error(e);
    		            return getHookNormal(fiber);
    		        }
    		    }
    		    else {
    		        return getHookNormal(fiber);
    		    }
    		};
    		var tryLinkStateToHookIndex = function (fiber, state) {
    		    var _a, _b, _c, _d, _e, _f;
    		    if (state.needUpdate && state.nodes) {
    		        // filter all hook update queue
    		        var nodes = (_b = (_a = state.nodes) === null || _a === void 0 ? void 0 : _a.filter) === null || _b === void 0 ? void 0 : _b.call(_a, function (node) { return node.type === reactShared.UpdateQueueType.hook; });
    		        // get all the keys from the nodes;
    		        var allHooksArray_1 = ((_d = (_c = fiber.hookList) === null || _c === void 0 ? void 0 : _c.toArray) === null || _d === void 0 ? void 0 : _d.call(_c)) || [];
    		        var keys = ((_f = (_e = nodes === null || nodes === void 0 ? void 0 : nodes.map) === null || _e === void 0 ? void 0 : _e.call(nodes, function (node) { var _a; return (_a = allHooksArray_1 === null || allHooksArray_1 === void 0 ? void 0 : allHooksArray_1.findIndex) === null || _a === void 0 ? void 0 : _a.call(allHooksArray_1, function (_node) { return (node === null || node === void 0 ? void 0 : node.trigger) === _node; }); })) === null || _f === void 0 ? void 0 : _f.filter(function (i) { return i !== -1; })) || [];
    		        // link the keys to the state
    		        linkStateToHookIndex.set(state, keys);
    		    }
    		};
    		var getHookIndexFromState = function (state) {
    		    return linkStateToHookIndex.get(state);
    		};
    		var deleteLinkState = function (state) {
    		    linkStateToHookIndex.delete(state);
    		};

    		var treeMap = new Map();
    		var detailMap = new Map();
    		var fiberStore = new Map();
    		var domToFiber = new WeakMap();
    		var plainStore = new Map();
    		var directory = {};
    		var count = 0;
    		var shallowAssignFiber = function (plain, fiber) {
    		    var hasKey = fiber.key !== null && fiber.key !== undefined;
    		    if (fiber.nativeNode) {
    		        domToFiber.set(fiber.nativeNode, fiber);
    		    }
    		    var typedContainerFiber = fiber;
    		    if (typedContainerFiber.containerNode) {
    		        domToFiber.set(typedContainerFiber.containerNode, fiber);
    		    }
    		    if (hasKey && !directory[fiber.key]) {
    		        directory[fiber.key] = ++count + "";
    		    }
    		    var name = getFiberName(fiber);
    		    if (!directory[name]) {
    		        directory[name] = ++count + "";
    		    }
    		    plain.k = hasKey ? directory[fiber.key] : undefined;
    		    var _a = getFiberType(fiber), t = _a.t, hasCompiler = _a.hasCompiler;
    		    plain.t = t;
    		    if (hasCompiler) {
    		        plain.m = true;
    		    }
    		    plain.n = directory[name];
    		};
    		var assignFiber = function (plain, fiber) {
    		    shallowAssignFiber(plain, fiber);
    		    plain.p = getProps(fiber);
    		    plain._s = getSource(fiber);
    		    plain._t = getTree$1(fiber);
    		    plain._h = getHook(fiber);
    		    if (fiber.type & exports.NODE_TYPE.__class__) {
    		        plain.s = getState(fiber);
    		    }
    		};
    		// TODO improve performance
    		var loopTree = function (fiber, parent) {
    		    if (!fiber)
    		        return null;
    		    if (reactShared.include(fiber.state, reactShared.STATE_TYPE.__unmount__))
    		        return null;
    		    var exist = treeMap.get(fiber);
    		    var current = exist || new PlainNode();
    		    current.c = null;
    		    if (parent) {
    		        parent.c = parent.c || [];
    		        parent.c.push(current);
    		        current.d = parent.d + 1;
    		    }
    		    else {
    		        current.d = 0;
    		    }
    		    current._d = current.d;
    		    shallowAssignFiber(current, fiber);
    		    if (!exist) {
    		        treeMap.set(fiber, current);
    		        fiberStore.set(current.i, fiber);
    		        plainStore.set(current.i, current);
    		    }
    		    if (fiber.child) {
    		        loopTree(fiber.child, current);
    		    }
    		    if (fiber.sibling) {
    		        loopTree(fiber.sibling, parent);
    		    }
    		    return { current: current, directory: directory };
    		};
    		var loopChangedTree = function (fiber, set, parent) {
    		    if (!fiber)
    		        return null;
    		    if (reactShared.include(fiber.state, reactShared.STATE_TYPE.__unmount__))
    		        return null;
    		    set.add(fiber);
    		    var exist = treeMap.get(fiber);
    		    // TODO throw a error?
    		    if (!exist && !parent)
    		        return null;
    		    var current = exist || new PlainNode();
    		    current.c = null;
    		    if (parent) {
    		        parent.c = parent.c || [];
    		        parent.c.push(current);
    		        current.d = parent.d + 1;
    		    }
    		    current._d = current.d;
    		    shallowAssignFiber(current, fiber);
    		    if (!exist) {
    		        treeMap.set(fiber, current);
    		        fiberStore.set(current.i, fiber);
    		        plainStore.set(current.i, current);
    		    }
    		    if (fiber.child) {
    		        loopChangedTree(fiber.child, set, current);
    		    }
    		    if (fiber.sibling) {
    		        loopChangedTree(fiber.sibling, set, parent);
    		    }
    		    return { current: current, directory: directory };
    		};
    		var unmountPlainNode = function (_fiber, _runtime) {
    		    if (!_fiber)
    		        return;
    		    var plain = treeMap.get(_fiber);
    		    if (plain) {
    		        _runtime.notifyUnmountNode(plain.i);
    		        fiberStore.delete(plain.i);
    		        plainStore.delete(plain.i);
    		        delete _runtime._hmr[plain.i];
    		        delete _runtime._warn[plain.i];
    		        delete _runtime._error[plain.i];
    		        delete _runtime._state[plain.i];
    		        delete _runtime._trigger[plain.i];
    		    }
    		    treeMap.delete(_fiber);
    		    detailMap.delete(_fiber);
    		};
    		var initPlainNode = function (_fiber, _runtime) {
    		    if (!_fiber)
    		        return;
    		    var plain = treeMap.get(_fiber);
    		    if (!plain) {
    		        var newPlain = new PlainNode();
    		        treeMap.set(_fiber, newPlain);
    		        fiberStore.set(newPlain.i, _fiber);
    		        plainStore.set(newPlain.i, newPlain);
    		    }
    		};
    		var getPlainNodeByFiber = function (fiber) {
    		    return treeMap.get(fiber);
    		};
    		var getPlainNodeIdByFiber = function (fiber) {
    		    var node = getPlainNodeByFiber(fiber);
    		    return node === null || node === void 0 ? void 0 : node.i;
    		};
    		var getRootTreeByFiber = function (fiber) {
    		    if (!fiber)
    		        return null;
    		    if (fiber.parent) {
    		        return getRootTreeByFiber(fiber.parent);
    		    }
    		    else {
    		        return getPlainNodeByFiber(fiber);
    		    }
    		};
    		var inspectDispatch = function (dispatch) {
    		    var rootFiber = dispatch.rootFiber;
    		    var map = loopTree(rootFiber);
    		    return map;
    		};
    		var inspectList = function (list) {
    		    var hasViewList = new WeakSet();
    		    var result = [];
    		    list.listToFoot(function (fiber) {
    		        if (hasViewList.has(fiber))
    		            return;
    		        hasViewList.add(fiber);
    		        var re = loopChangedTree(fiber, hasViewList);
    		        if (re && re.current) {
    		            result.push(re.current);
    		        }
    		    });
    		    return { result: result, directory: directory };
    		};
    		var inspectFiber = function (fiber) {
    		    var plainNode = getPlainNodeByFiber(fiber);
    		    if (!plainNode) {
    		        throw new Error("plainNode not found, look like a bug for @my-react/devtools");
    		    }
    		    var exist = detailMap.get(fiber);
    		    if (exist) {
    		        assignFiber(exist, fiber);
    		        return exist;
    		    }
    		    else {
    		        var created = new PlainNode(plainNode.i);
    		        assignFiber(created, fiber);
    		        detailMap.set(fiber, created);
    		        return created;
    		    }
    		};
    		var getFiberByDom = function (dom) {
    		    var fiber = domToFiber.get(dom);
    		    if (!fiber) {
    		        if (dom.parentElement) {
    		            return getFiberByDom(dom.parentElement);
    		        }
    		        else {
    		            return null;
    		        }
    		    }
    		    else {
    		        return fiber;
    		    }
    		};
    		var getComponentFiberByDom = function (dom) {
    		    var fiber = getFiberByDom(dom);
    		    if (!fiber)
    		        return;
    		    var r = fiber;
    		    while (r) {
    		        if (reactShared.include(r.type, exports.NODE_TYPE.__class__) || reactShared.include(r.type, exports.NODE_TYPE.__function__)) {
    		            return r;
    		        }
    		        r = r.parent;
    		    }
    		};
    		var getComponentFiberByFiber = function (fiber) {
    		    var r = fiber;
    		    while (r) {
    		        if (reactShared.include(r.type, exports.NODE_TYPE.__class__) || reactShared.include(r.type, exports.NODE_TYPE.__function__)) {
    		            return r;
    		        }
    		        r = r.parent;
    		    }
    		};
    		var getElementNodesFromFiber = function (fiber) {
    		    var nodes = [];
    		    var fibers = fiber ? [fiber] : [];
    		    while (fibers.length) {
    		        var c = fibers.shift();
    		        if (c.nativeNode) {
    		            nodes.push(c.nativeNode);
    		        }
    		        else {
    		            var l = c.child;
    		            while (l) {
    		                fibers.push(l);
    		                l = l.sibling;
    		            }
    		        }
    		    }
    		    return nodes;
    		};
    		var getDispatchFromFiber = function (fiber) {
    		    if (!fiber)
    		        return;
    		    var typedFiber = fiber;
    		    if (typedFiber.renderDispatch) {
    		        return typedFiber.renderDispatch;
    		    }
    		    return getDispatchFromFiber(fiber.parent);
    		};
    		var getFiberNodeById = function (id) {
    		    return fiberStore.get(id);
    		};
    		var getDirectoryIdByFiber = function (fiber) {
    		    var name = getFiberName(fiber);
    		    return directory[name];
    		};

    		// browser platform inspect
    		var inspectSource = function (core) {
    		    if (!core.hasEnable)
    		        return;
    		    if (typeof globalThis["inspect"] !== "function") {
    		        core.notifyMessage("current platform not support inspect", "warning");
    		        return;
    		    }
    		    if (typeof core._source === "function" && typeof globalThis["inspect"] === "function") {
    		        var s = core._source;
    		        core._source = null;
    		        globalThis["inspect"](s);
    		        return;
    		    }
    		    if (core._source && typeof HTMLElement !== "undefined" && core._source instanceof HTMLElement && typeof globalThis["inspect"] === "function") {
    		        var s = core._source;
    		        core._source = null;
    		        globalThis["inspect"](s);
    		        window["$$$$0"] = s;
    		        return;
    		    }
    		    core.notifyMessage("can not view source for current item", "warning");
    		};
    		var inspectCom = function (core) {
    		    if (!core.hasEnable)
    		        return;
    		    var id = core._selectId;
    		    if (!id)
    		        return;
    		    if (typeof globalThis["inspect"] !== "function") {
    		        core.notifyMessage("current platform not support inspect", "warning");
    		        return;
    		    }
    		    var fiber = getFiberNodeById(id);
    		    if (fiber) {
    		        var elementType = fiber.elementType;
    		        if (typeof globalThis["inspect"] === "function" && elementType) {
    		            globalThis["inspect"](elementType);
    		            return;
    		        }
    		    }
    		    core.notifyMessage("current id: ".concat(id, " of fiber can not inspect"), "warning");
    		};
    		var inspectDom = function (core) {
    		    if (!core.hasEnable)
    		        return;
    		    var dom = core._selectDom;
    		    if (typeof globalThis["inspect"] !== "function") {
    		        core.notifyMessage("current platform not support inspect", "warning");
    		        return;
    		    }
    		    if (typeof globalThis["inspect"] === "function" && dom) {
    		        globalThis["inspect"](dom);
    		        window["$$$$0"] = dom;
    		        return;
    		    }
    		    core.notifyMessage("current id: ".concat(core._selectId, " of fiber not contain dom node"), "warning");
    		};

    		/* eslint-disable @typescript-eslint/no-unsafe-function-type */
    		var debounce = function (callback, time) {
    		    var id = null;
    		    return (function () {
    		        var args = [];
    		        for (var _i = 0; _i < arguments.length; _i++) {
    		            args[_i] = arguments[_i];
    		        }
    		        clearTimeout(id);
    		        id = setTimeout(function () {
    		            callback.call.apply(callback, __spreadArray([null], args, false));
    		        }, time || 40);
    		    });
    		};
    		var throttle = function (callback, time) {
    		    var id = null;
    		    return (function () {
    		        var args = [];
    		        for (var _i = 0; _i < arguments.length; _i++) {
    		            args[_i] = arguments[_i];
    		        }
    		        if (id)
    		            return;
    		        id = setTimeout(function () {
    		            callback.call.apply(callback, __spreadArray([null], args, false));
    		            id = null;
    		        }, time || 40);
    		    });
    		};

    		var cb = function () { };
    		var enableBrowserHover = function (core) {
    		    if (!core.hasEnable)
    		        return;
    		    if (core._enableHoverOnBrowser)
    		        return;
    		    if (typeof document === "undefined") {
    		        return;
    		    }
    		    core._enableHoverOnBrowser = true;
    		    core.select.remove();
    		    var debounceNotifyDomClick = debounce(function () {
    		        core.notifyDomHover();
    		        core.disableBrowserHover();
    		        core.notifyConfig();
    		    }, 100);
    		    var onMouseEnter = debounce(function (e) {
    		        var target = e.target;
    		        core.select.remove();
    		        if (!core.hasEnable)
    		            return;
    		        if (target.nodeType === Node.ELEMENT_NODE) {
    		            var fiber = getComponentFiberByDom(target);
    		            if (fiber) {
    		                core.select.remove();
    		                core.select.inspect(fiber);
    		                var id = getPlainNodeIdByFiber(fiber);
    		                core._tempDomHoverId = id;
    		            }
    		        }
    		    }, 16);
    		    var onClick = function (e) {
    		        if (!core.hasEnable)
    		            return;
    		        core._domHoverId = core._tempDomHoverId;
    		        debounceNotifyDomClick();
    		        e.stopPropagation();
    		        e.preventDefault();
    		    };
    		    document.addEventListener("mouseenter", onMouseEnter, true);
    		    document.addEventListener("click", onClick, true);
    		    document.addEventListener("mousedown", onClick, true);
    		    document.addEventListener("pointerdown", onClick, true);
    		    cb = function () {
    		        core._enableHoverOnBrowser = false;
    		        core.select.remove();
    		        document.removeEventListener("mouseenter", onMouseEnter, true);
    		        document.removeEventListener("click", onClick, true);
    		        document.removeEventListener("mousedown", onClick, true);
    		        document.removeEventListener("pointerdown", onClick, true);
    		    };
    		};
    		var disableBrowserHover = function (core) {
    		    if (!core._enableHoverOnBrowser)
    		        return;
    		    cb();
    		};
    		var setHoverStatus = function (core, d) {
    		    if (!core.hasEnable)
    		        return;
    		    core._enableHover = d;
    		};

    		var setUpdateStatus = function (core, d) {
    		    if (!core._enabled)
    		        return;
    		    core._enableUpdate = d;
    		    if (!core._enableUpdate) {
    		        core.update.cancelPending();
    		    }
    		};

    		var setRetriggerStatus = function (core, d) {
    		    if (!core._enabled)
    		        return;
    		    core._enableRetrigger = d;
    		    core.notifyTrigger();
    		    core.notifyTriggerStatus();
    		};

    		exports.MessageHookType = void 0;
    		(function (MessageHookType) {
    		    MessageHookType["init"] = "hook-init";
    		    MessageHookType["mount"] = "hook-mount";
    		    MessageHookType["render"] = "hook-render";
    		    MessageHookType["origin"] = "hook-origin";
    		    MessageHookType["clear"] = "hook-clear";
    		})(exports.MessageHookType || (exports.MessageHookType = {}));
    		exports.MessageDetectorType = void 0;
    		(function (MessageDetectorType) {
    		    MessageDetectorType["init"] = "detector-init";
    		})(exports.MessageDetectorType || (exports.MessageDetectorType = {}));
    		exports.MessageProxyType = void 0;
    		(function (MessageProxyType) {
    		    MessageProxyType["init"] = "proxy-init";
    		})(exports.MessageProxyType || (exports.MessageProxyType = {}));
    		exports.MessagePanelType = void 0;
    		(function (MessagePanelType) {
    		    MessagePanelType["show"] = "panel-show";
    		    MessagePanelType["hide"] = "panel-hide";
    		    MessagePanelType["varStore"] = "panel-var-store";
    		    MessagePanelType["varSource"] = "panel-var-source";
    		    MessagePanelType["enableHover"] = "panel-enable-hover";
    		    MessagePanelType["enableUpdate"] = "panel-enable-update";
    		    MessagePanelType["enableRetrigger"] = "panel-enable-retrigger";
    		    MessagePanelType["enableHoverOnBrowser"] = "panel-enable-hover-on-browser";
    		    MessagePanelType["enableRecord"] = "panel-enable-record";
    		    MessagePanelType["nodeHover"] = "panel-hover";
    		    MessagePanelType["nodeSelect"] = "panel-select";
    		    MessagePanelType["nodeStore"] = "panel-store";
    		    MessagePanelType["nodeEditor"] = "panel-editor";
    		    MessagePanelType["nodeTrigger"] = "panel-trigger";
    		    MessagePanelType["nodeInspect"] = "panel-inspect";
    		    MessagePanelType["chunks"] = "panel-chunks";
    		    MessagePanelType["clear"] = "panel-clear";
    		    MessagePanelType["clearHMR"] = "panel-clear-hmr";
    		    MessagePanelType["clearMessage"] = "panel-clear-message";
    		    MessagePanelType["clearTrigger"] = "panel-clear-trigger";
    		})(exports.MessagePanelType || (exports.MessagePanelType = {}));
    		exports.MessageWorkerType = void 0;
    		(function (MessageWorkerType) {
    		    MessageWorkerType["init"] = "worker-init";
    		    MessageWorkerType["close"] = "worker-close";
    		})(exports.MessageWorkerType || (exports.MessageWorkerType = {}));
    		exports.DevToolMessageEnum = void 0;
    		(function (DevToolMessageEnum) {
    		    // 初始化，判断是否用@my-react进行页面渲染
    		    DevToolMessageEnum["init"] = "init";
    		    DevToolMessageEnum["dir"] = "dir";
    		    DevToolMessageEnum["config"] = "config";
    		    // tree ready
    		    DevToolMessageEnum["ready"] = "ready";
    		    // tree update
    		    DevToolMessageEnum["update"] = "update";
    		    DevToolMessageEnum["changed"] = "changed";
    		    DevToolMessageEnum["highlight"] = "highlight";
    		    DevToolMessageEnum["trigger"] = "trigger";
    		    DevToolMessageEnum["triggerStatus"] = "triggerStatus";
    		    DevToolMessageEnum["hmr"] = "hmr";
    		    DevToolMessageEnum["hmrStatus"] = "hmrStatus";
    		    DevToolMessageEnum["hmrInternal"] = "hmrInternal";
    		    DevToolMessageEnum["source"] = "source";
    		    DevToolMessageEnum["detail"] = "detail";
    		    DevToolMessageEnum["unmount"] = "unmount";
    		    DevToolMessageEnum["unmountNode"] = "unmount-node";
    		    DevToolMessageEnum["selectSync"] = "select-sync";
    		    DevToolMessageEnum["message"] = "message";
    		    DevToolMessageEnum["warn"] = "warn";
    		    DevToolMessageEnum["warnStatus"] = "warnStatus";
    		    DevToolMessageEnum["error"] = "error";
    		    DevToolMessageEnum["errorStatus"] = "errorStatus";
    		    DevToolMessageEnum["chunks"] = "chunks";
    		    DevToolMessageEnum["record"] = "record";
    		    DevToolMessageEnum["domHover"] = "dom-hover";
    		})(exports.DevToolMessageEnum || (exports.DevToolMessageEnum = {}));
    		exports.HMRStatus = void 0;
    		(function (HMRStatus) {
    		    HMRStatus[HMRStatus["none"] = 0] = "none";
    		    HMRStatus[HMRStatus["refresh"] = 1] = "refresh";
    		    HMRStatus[HMRStatus["remount"] = 2] = "remount";
    		})(exports.HMRStatus || (exports.HMRStatus = {}));
    		var DevToolSource = "@my-react/devtool";

    		var patchEvent = function (dispatch, runtime) {
    		    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    		    if (dispatch["$$hasDevToolEvent"])
    		        return;
    		    dispatch["$$hasDevToolEvent"] = true;
    		    var onLoad = throttle(function () {
    		        if (!runtime.hasEnable)
    		            return;
    		        runtime.notifyDispatch(dispatch);
    		        runtime.notifySelect();
    		        runtime.notifyHMRStatus();
    		        runtime.notifyHMRExtend();
    		        runtime.notifyTriggerStatus();
    		        runtime.notifyWarnStatus();
    		        runtime.notifyErrorStatus();
    		    }, 200);
    		    var onTrace = function () {
    		        if (!runtime.hasEnable)
    		            return;
    		        if (!runtime._enableUpdate)
    		            return;
    		        runtime.update.flushPending();
    		    };
    		    var onChange = function (list) {
    		        if (!runtime.hasEnable)
    		            return;
    		        var directory = inspectList(list).directory;
    		        if (!reactShared.isNormalEquals(runtime._dir, directory)) {
    		            runtime._dir = __assign({}, directory);
    		            runtime.notifyDir();
    		        }
    		        runtime.notifyChanged(list);
    		    };
    		    var onUnmount = function () {
    		        // if (!runtime.hasEnable) return;
    		        runtime._needUnmount = true;
    		        runtime.delDispatch(dispatch);
    		    };
    		    var notifyTriggerWithThrottle = throttle(function () { return runtime.notifyTrigger(); }, 100);
    		    var onFiberTrigger = function (fiber, state) {
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (!id)
    		            return;
    		        runtime._trigger[id] = runtime._trigger[id] || [];
    		        // 长数据过滤
    		        if (runtime._trigger[id].length > 10) {
    		            var index = runtime._trigger[id].length - 11;
    		            if (runtime._trigger[id][index]) {
    		                deleteLinkState(runtime._trigger[id][index]);
    		            }
    		            runtime._trigger[id][index] = { isRetrigger: runtime._trigger[id][index].isRetrigger };
    		        }
    		        tryLinkStateToHookIndex(fiber, state);
    		        runtime._trigger[id].push(state);
    		        if (!runtime.hasEnable)
    		            return;
    		        notifyTriggerWithThrottle();
    		    };
    		    var onFiberUpdate = function (fiber) {
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (!id)
    		            return;
    		        if (!runtime.hasEnable)
    		            return;
    		        if (id === runtime._selectId) {
    		            runtime.notifySelect();
    		            runtime.notifyHMRStatus();
    		            runtime.notifyHMRExtend();
    		            runtime.notifyTriggerStatus();
    		            runtime.notifyWarnStatus();
    		            runtime.notifyErrorStatus();
    		        }
    		    };
    		    var onFiberState = function (fiber) {
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (!id)
    		            return;
    		        runtime._state[id] = runtime._state[id] ? runtime._state[id] + 1 : 1;
    		    };
    		    var onFiberHMR = function (fiber, forceRefresh) {
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (!id)
    		            return;
    		        runtime._hmr[id] = runtime._hmr[id] || [];
    		        runtime._hmr[id].push(typeof forceRefresh === "boolean" ? (forceRefresh ? exports.HMRStatus.remount : exports.HMRStatus.refresh) : exports.HMRStatus.none);
    		        if (!runtime.hasEnable)
    		            return;
    		        runtime.notifyHMR();
    		        runtime.notifyDispatch(dispatch, true);
    		    };
    		    var onFiberWarn = function (fiber) {
    		        var args = [];
    		        for (var _i = 1; _i < arguments.length; _i++) {
    		            args[_i - 1] = arguments[_i];
    		        }
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (!id)
    		            return;
    		        runtime._warn[id] = runtime._warn[id] || [];
    		        if (runtime._warn[id].length > 10) {
    		            var index = runtime._warn[id].length - 11;
    		            runtime._warn[id][index] = 1;
    		        }
    		        runtime._warn[id].push(args);
    		        runtime.notifyWarn();
    		    };
    		    var onFiberError = function (fiber) {
    		        var args = [];
    		        for (var _i = 1; _i < arguments.length; _i++) {
    		            args[_i - 1] = arguments[_i];
    		        }
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (!id)
    		            return;
    		        runtime._error[id] = runtime._error[id] || [];
    		        if (runtime._error[id].length > 10) {
    		            var index = runtime._error[id].length - 11;
    		            runtime._error[id][index] = 1;
    		        }
    		        runtime._error[id].push(args);
    		        runtime.notifyError();
    		    };
    		    var onPerformanceWarn = function (fiber) {
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (!id)
    		            return;
    		        if (runtime.hasEnable && runtime._enableUpdate) {
    		            runtime.update.addPending(fiber, "warn");
    		        }
    		        runtime.notifyHighlight(id, "performance");
    		    };
    		    var onDOMUpdate = function (fiber) {
    		        if (runtime.hasEnable && runtime._enableUpdate) {
    		            runtime.update.addPending(fiber, "update");
    		        }
    		    };
    		    var onDOMAppend = function (fiber) {
    		        if (runtime.hasEnable && runtime._enableUpdate) {
    		            runtime.update.addPending(fiber, "append");
    		        }
    		    };
    		    var onDOMSetRef = function (fiber) {
    		        if (runtime.hasEnable && runtime._enableUpdate) {
    		            runtime.update.addPending(fiber, "setRef");
    		        }
    		    };
    		    if (typeof dispatch.onFiberTrigger === "function") {
    		        if (typeof dispatch.onAfterCommitMount === "function") {
    		            dispatch.onAfterCommitMount(onLoad);
    		            dispatch.onAfterCommitUpdate(onTrace);
    		            dispatch.onAfterCommitUnmount(onUnmount);
    		        }
    		        else {
    		            dispatch.onAfterCommit(onLoad);
    		            dispatch.onAfterUpdate(onTrace);
    		            (_a = dispatch.onAfterUnmount) === null || _a === void 0 ? void 0 : _a.call(dispatch, onUnmount);
    		        }
    		        (_b = dispatch.onFiberState) === null || _b === void 0 ? void 0 : _b.call(dispatch, onFiberState);
    		        (_c = dispatch.onFiberTrigger) === null || _c === void 0 ? void 0 : _c.call(dispatch, onFiberTrigger);
    		        (_d = dispatch.onPerformanceWarn) === null || _d === void 0 ? void 0 : _d.call(dispatch, onPerformanceWarn);
    		        (_e = dispatch.onFiberChange) === null || _e === void 0 ? void 0 : _e.call(dispatch, onChange);
    		        (_f = dispatch.onFiberUpdate) === null || _f === void 0 ? void 0 : _f.call(dispatch, onFiberUpdate);
    		        (_g = dispatch.onFiberHMR) === null || _g === void 0 ? void 0 : _g.call(dispatch, onFiberHMR);
    		        (_h = dispatch.onDOMUpdate) === null || _h === void 0 ? void 0 : _h.call(dispatch, onDOMUpdate);
    		        (_j = dispatch.onDOMAppend) === null || _j === void 0 ? void 0 : _j.call(dispatch, onDOMAppend);
    		        (_k = dispatch.onDOMSetRef) === null || _k === void 0 ? void 0 : _k.call(dispatch, onDOMSetRef);
    		        (_l = dispatch.onFiberError) === null || _l === void 0 ? void 0 : _l.call(dispatch, onFiberError);
    		        (_m = dispatch.onFiberWarn) === null || _m === void 0 ? void 0 : _m.call(dispatch, onFiberWarn);
    		    }
    		    else {
    		        var originalAfterCommit_1 = dispatch.afterCommit;
    		        var originalAfterUpdate_1 = dispatch.afterUpdate;
    		        var originalAfterUnmount_1 = dispatch.afterUnmount;
    		        dispatch.afterCommit = function () {
    		            var _a;
    		            (_a = originalAfterCommit_1 === null || originalAfterCommit_1 === void 0 ? void 0 : originalAfterCommit_1.call) === null || _a === void 0 ? void 0 : _a.call(originalAfterCommit_1, this);
    		            onLoad();
    		        };
    		        // TODO `global patch` flag for performance
    		        dispatch.afterUpdate = function () {
    		            var _a;
    		            (_a = originalAfterUpdate_1 === null || originalAfterUpdate_1 === void 0 ? void 0 : originalAfterUpdate_1.call) === null || _a === void 0 ? void 0 : _a.call(originalAfterUpdate_1, this);
    		            onLoad();
    		        };
    		        dispatch.afterUnmount = function () {
    		            var _a;
    		            (_a = originalAfterUnmount_1 === null || originalAfterUnmount_1 === void 0 ? void 0 : originalAfterUnmount_1.call) === null || _a === void 0 ? void 0 : _a.call(originalAfterUnmount_1, this);
    		            onUnmount();
    		        };
    		    }
    		};

    		var checkIsValidDispatchVersion = function (dispatch) {
    		    var _a;
    		    var version = ((_a = dispatch.version) === null || _a === void 0 ? void 0 : _a.split(".").map(function (v) { return parseInt(v, 10); })) || [];
    		    if (version.length !== 3)
    		        return false;
    		    if (version[1] < 3)
    		        return false;
    		    if (version[2] >= 21)
    		        return true;
    		    return false;
    		};
    		var checkIsComponent = function (fiber) {
    		    return reactShared.include(fiber.type, exports.NODE_TYPE.__class__ | exports.NODE_TYPE.__function__);
    		};
    		var checkIsConCurrent = function (dispatch, list) {
    		    return dispatch.enableConcurrentMode && list.every(function (f) { return reactShared.include(f.state, reactShared.STATE_TYPE.__triggerConcurrent__ | reactShared.STATE_TYPE.__triggerConcurrentForce__); });
    		};
    		var getCurrent = function () { return (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) * 1000; };
    		var resetArray = [];
    		var patchRecord = function (dispatch, runtime) {
    		    if (!checkIsValidDispatchVersion(dispatch))
    		        return;
    		    if (dispatch.mode !== "development")
    		        return;
    		    runtime._supportRecord = true;
    		    var stack = [];
    		    var map = {};
    		    var mode = "legacy";
    		    var id = "";
    		    var current = null;
    		    if (dispatch["$$hasDevToolRecord"])
    		        return;
    		    dispatch["$$hasDevToolRecord"] = true;
    		    dispatch.onBeforeDispatchUpdate(function (_, list) {
    		        if (!runtime._enableRecord)
    		            return;
    		        current = null;
    		        stack.length = 0;
    		        map = {};
    		        mode = checkIsConCurrent(dispatch, list) ? "concurrent" : "legacy";
    		        id = dispatch.id;
    		    });
    		    dispatch.onBeforeFiberRun(function (fiber) {
    		        if (!runtime._enableRecord)
    		            return;
    		        if (!checkIsComponent(fiber))
    		            return;
    		        var nodeId = getPlainNodeIdByFiber(fiber);
    		        if (nodeId === null)
    		            return;
    		        map[nodeId] = true;
    		        // rerun check
    		        if (current && current.i === nodeId) {
    		            current.r = (current.r || 0) + 1;
    		            return;
    		        }
    		        var node = {
    		            i: nodeId,
    		            n: getDirectoryIdByFiber(fiber),
    		            s: getCurrent(),
    		        };
    		        if (current) {
    		            current.c = current.c || [];
    		            current.c.push(node);
    		        }
    		        stack.push(node);
    		        current = node;
    		    });
    		    dispatch.onAfterFiberDone(function (fiber) {
    		        if (!runtime._enableRecord)
    		            return;
    		        if (!checkIsComponent(fiber))
    		            return;
    		        var nodeId = getPlainNodeIdByFiber(fiber);
    		        if (nodeId === null)
    		            return;
    		        if (!map[nodeId]) {
    		            return;
    		        }
    		        var stackTop = stack.pop();
    		        while (stackTop && stackTop.i !== nodeId) {
    		            stackTop = stack.pop();
    		        }
    		        if (!stackTop)
    		            return;
    		        stackTop.e = getCurrent();
    		        stackTop.d = Math.max(Math.floor(stackTop.e - stackTop.s), 1);
    		        current = stack[stack.length - 1] || null;
    		        if (!current) {
    		            runtime._stack.push({ stack: stackTop, id: id, mode: mode });
    		        }
    		    });
    		    var reset = function () {
    		        stack.length = 0;
    		        current = null;
    		        map = {};
    		    };
    		    resetArray.push(reset);
    		    runtime.startRecord = function () {
    		        if (!runtime._supportRecord)
    		            return;
    		        runtime._enableRecord = true;
    		        runtime._stack.length = 0;
    		        resetArray.forEach(function (r) { return r(); });
    		    };
    		    runtime.stopRecord = function () {
    		        if (!runtime._supportRecord)
    		            return;
    		        runtime._enableRecord = false;
    		        runtime.notifyRecordStack();
    		        resetArray.forEach(function (r) { return r(); });
    		    };
    		};
    		var getRecord = function (runtime) {
    		    if (!runtime._enabled)
    		        return [];
    		    var stack = runtime._stack;
    		    return stack;
    		};

    		var getTree = function (dispatch, runtime) {
    		    var _a = inspectDispatch(dispatch), directory = _a.directory, current = _a.current;
    		    runtime._map.set(dispatch, current);
    		    if (!reactShared.isNormalEquals(runtime._dir, directory)) {
    		        runtime._dir = __assign({}, directory);
    		        return { directory: directory, current: current };
    		    }
    		    return { current: current };
    		};
    		var getValidTrigger = function (runtime) {
    		    return Object.keys(runtime._trigger).reduce(function (p, c) {
    		        var t = runtime._trigger[c];
    		        var f = t.filter(function (i) { return (i.isRetrigger ? runtime._enableRetrigger : true); });
    		        p[c] = f.length;
    		        return p;
    		    }, {});
    		};
    		var getValidTriggerStatus = function (id, runtime) {
    		    var status = runtime._trigger[id];
    		    if (!status)
    		        return;
    		    var finalStatus = status.filter(function (i) { return (i.isRetrigger ? runtime._enableRetrigger : true); }).slice(-10);
    		    return finalStatus.map(function (i) {
    		        var _keysToLinkHook = getHookIndexFromState(i);
    		        var node = getNode(i);
    		        if (_keysToLinkHook && _keysToLinkHook.length > 0) {
    		            node._keysToLinkHook = _keysToLinkHook;
    		        }
    		        return node;
    		    });
    		};
    		var getMapValueLengthObject = function (map) {
    		    return Object.keys(map).reduce(function (p, c) {
    		        p[c] = map[c].length;
    		        return p;
    		    }, {});
    		};
    		var getChunkDataFromIds = function (ids) {
    		    return ids.reduce(function (p, c) {
    		        var d = getNodeFromId(Number(c));
    		        p[c] = { loaded: d };
    		        return p;
    		    }, {});
    		};

    		// TODO use 'eventListener' instead of 'patchFunction'
    		function overridePatchToFiberUnmount(dispatch, runtime) {
    		    if (typeof dispatch.onFiberUnmount === "function") {
    		        dispatch.onFiberUnmount(function (f) { return unmountPlainNode(f, runtime); });
    		    }
    		    else {
    		        var originalPatchUnmount_1 = dispatch.patchToFiberUnmount;
    		        dispatch.patchToFiberUnmount = function (fiber) {
    		            originalPatchUnmount_1.call(this, fiber);
    		            unmountPlainNode(fiber, runtime);
    		        };
    		    }
    		}
    		function overridePatchToFiberInit(dispatch, runtime) {
    		    if (typeof dispatch.onFiberInitial === "function") {
    		        dispatch.onFiberInitial(function (f) { return initPlainNode(f); });
    		    }
    		    else {
    		        var originalPatchInit_1 = dispatch.patchToFiberInitial;
    		        dispatch.patchToFiberInitial = function (fiber) {
    		            originalPatchInit_1.call(this, fiber);
    		            initPlainNode(fiber);
    		        };
    		    }
    		}
    		var setupDispatch = function (dispatch, runtime) {
    		    if (dispatch["$$hasDevToolInject"])
    		        return;
    		    dispatch["$$hasDevToolInject"] = true;
    		    overridePatchToFiberInit(dispatch);
    		    overridePatchToFiberUnmount(dispatch, runtime);
    		    Object.defineProperty(dispatch, "__dev_devtool_runtime__", { value: { core: runtime, version: "0.0.1" } });
    		};

    		// Get the window object for the document that a node belongs to,
    		// or return null if it cannot be found (node not attached to DOM,
    		// etc).
    		function getOwnerWindow(node) {
    		    if (!node.ownerDocument) {
    		        return null;
    		    }
    		    return node.ownerDocument.defaultView;
    		}
    		// Get the iframe containing a node, or return null if it cannot
    		// be found (node not within iframe, etc).
    		function getOwnerIframe(node) {
    		    var nodeWindow = getOwnerWindow(node);
    		    if (nodeWindow) {
    		        return nodeWindow.frameElement;
    		    }
    		    return null;
    		}
    		// Get a bounding client rect for a node, with an
    		// offset added to compensate for its border.
    		function getBoundingClientRectWithBorderOffset(node) {
    		    var dimensions = getElementDimensions(node);
    		    // $FlowFixMe[incompatible-variance]
    		    return mergeRectOffsets([
    		        node.getBoundingClientRect(),
    		        {
    		            top: dimensions.borderTop,
    		            left: dimensions.borderLeft,
    		            bottom: dimensions.borderBottom,
    		            right: dimensions.borderRight,
    		            // This width and height won't get used by mergeRectOffsets (since this
    		            // is not the first rect in the array), but we set them so that this
    		            // object type checks as a ClientRect.
    		            width: 0,
    		            height: 0,
    		        },
    		    ]);
    		}
    		// Add together the top, left, bottom, and right properties of
    		// each ClientRect, but keep the width and height of the first one.
    		function mergeRectOffsets(rects) {
    		    return rects.reduce(function (previousRect, rect) {
    		        if (previousRect == null) {
    		            return rect;
    		        }
    		        return {
    		            top: previousRect.top + rect.top,
    		            left: previousRect.left + rect.left,
    		            width: previousRect.width,
    		            height: previousRect.height,
    		            bottom: previousRect.bottom + rect.bottom,
    		            right: previousRect.right + rect.right,
    		        };
    		    });
    		}
    		// Calculate a boundingClientRect for a node relative to boundaryWindow,
    		// taking into account any offsets caused by intermediate iframes.
    		function getNestedBoundingClientRect(node, boundaryWindow) {
    		    var ownerIframe = getOwnerIframe(node);
    		    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    		    // @ts-ignore
    		    if (ownerIframe && ownerIframe !== boundaryWindow) {
    		        var rects = [node.getBoundingClientRect()];
    		        var currentIframe = ownerIframe;
    		        var onlyOneMore = false;
    		        while (currentIframe) {
    		            var rect = getBoundingClientRectWithBorderOffset(currentIframe);
    		            rects.push(rect);
    		            currentIframe = getOwnerIframe(currentIframe);
    		            if (onlyOneMore) {
    		                break;
    		            }
    		            // We don't want to calculate iframe offsets upwards beyond
    		            // the iframe containing the boundaryWindow, but we
    		            // need to calculate the offset relative to the boundaryWindow.
    		            if (currentIframe && getOwnerWindow(currentIframe) === boundaryWindow) {
    		                onlyOneMore = true;
    		            }
    		        }
    		        // $FlowFixMe[incompatible-variance]
    		        return mergeRectOffsets(rects);
    		    }
    		    else {
    		        // $FlowFixMe[incompatible-variance]
    		        return node.getBoundingClientRect();
    		    }
    		}
    		function getElementDimensions(domElement) {
    		    var calculatedStyle = window.getComputedStyle(domElement);
    		    return {
    		        borderLeft: parseInt(calculatedStyle.borderLeftWidth, 10),
    		        borderRight: parseInt(calculatedStyle.borderRightWidth, 10),
    		        borderTop: parseInt(calculatedStyle.borderTopWidth, 10),
    		        borderBottom: parseInt(calculatedStyle.borderBottomWidth, 10),
    		        marginLeft: parseInt(calculatedStyle.marginLeft, 10),
    		        marginRight: parseInt(calculatedStyle.marginRight, 10),
    		        marginTop: parseInt(calculatedStyle.marginTop, 10),
    		        marginBottom: parseInt(calculatedStyle.marginBottom, 10),
    		        paddingLeft: parseInt(calculatedStyle.paddingLeft, 10),
    		        paddingRight: parseInt(calculatedStyle.paddingRight, 10),
    		        paddingTop: parseInt(calculatedStyle.paddingTop, 10),
    		        paddingBottom: parseInt(calculatedStyle.paddingBottom, 10),
    		    };
    		}

    		/* eslint-disable @typescript-eslint/ban-ts-comment */
    		var assign = Object.assign;
    		// Note that the Overlay components are not affected by the active Theme,
    		// because they highlight elements in the main Chrome window (outside of devtools).
    		// The colors below were chosen to roughly match those used by Chrome devtools.
    		var OverlayRect = /** @class */ (function () {
    		    function OverlayRect(doc, container) {
    		        this.node = doc.createElement("div");
    		        this.border = doc.createElement("div");
    		        this.padding = doc.createElement("div");
    		        this.content = doc.createElement("div");
    		        this.border.style.borderColor = overlayStyles.border;
    		        this.padding.style.borderColor = overlayStyles.padding;
    		        this.content.style.backgroundColor = overlayStyles.background;
    		        assign(this.node.style, {
    		            borderColor: overlayStyles.margin,
    		            pointerEvents: "none",
    		            position: "fixed",
    		        });
    		        this.node.style.zIndex = "10000000";
    		        this.node.appendChild(this.border);
    		        this.border.appendChild(this.padding);
    		        this.padding.appendChild(this.content);
    		        container.appendChild(this.node);
    		    }
    		    OverlayRect.prototype.remove = function () {
    		        if (this.node.parentNode) {
    		            this.node.parentNode.removeChild(this.node);
    		        }
    		    };
    		    OverlayRect.prototype.update = function (box, dims) {
    		        boxWrap(dims, "margin", this.node);
    		        boxWrap(dims, "border", this.border);
    		        boxWrap(dims, "padding", this.padding);
    		        assign(this.content.style, {
    		            height: box.height - dims.borderTop - dims.borderBottom - dims.paddingTop - dims.paddingBottom + "px",
    		            width: box.width - dims.borderLeft - dims.borderRight - dims.paddingLeft - dims.paddingRight + "px",
    		        });
    		        assign(this.node.style, {
    		            top: box.top - dims.marginTop + "px",
    		            left: box.left - dims.marginLeft + "px",
    		        });
    		    };
    		    return OverlayRect;
    		}());
    		var OverlayTip = /** @class */ (function () {
    		    function OverlayTip(doc, container) {
    		        this.tip = doc.createElement("div");
    		        assign(this.tip.style, {
    		            display: "flex",
    		            flexFlow: "row nowrap",
    		            backgroundColor: "#333740",
    		            borderRadius: "2px",
    		            fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
    		            fontWeight: "bold",
    		            padding: "3px 5px",
    		            pointerEvents: "none",
    		            position: "fixed",
    		            fontSize: "12px",
    		            whiteSpace: "nowrap",
    		        });
    		        this.nameSpan = doc.createElement("span");
    		        this.tip.appendChild(this.nameSpan);
    		        assign(this.nameSpan.style, {
    		            color: "#ee78e6",
    		            borderRight: "1px solid #aaaaaa",
    		            paddingRight: "0.5rem",
    		            marginRight: "0.5rem",
    		        });
    		        this.dimSpan = doc.createElement("span");
    		        this.tip.appendChild(this.dimSpan);
    		        assign(this.dimSpan.style, {
    		            color: "#d7d7d7",
    		        });
    		        this.tip.style.zIndex = "10000000";
    		        container.appendChild(this.tip);
    		    }
    		    OverlayTip.prototype.remove = function () {
    		        if (this.tip.parentNode) {
    		            this.tip.parentNode.removeChild(this.tip);
    		        }
    		    };
    		    OverlayTip.prototype.updateText = function (name, width, height) {
    		        this.nameSpan.textContent = name;
    		        this.dimSpan.textContent = Math.round(width) + "px × " + Math.round(height) + "px";
    		    };
    		    OverlayTip.prototype.updatePosition = function (dims, bounds) {
    		        var tipRect = this.tip.getBoundingClientRect();
    		        var tipPos = findTipPos(dims, bounds, {
    		            width: tipRect.width,
    		            height: tipRect.height,
    		        });
    		        assign(this.tip.style, tipPos.style);
    		    };
    		    return OverlayTip;
    		}());
    		var Overlay = /** @class */ (function () {
    		    function Overlay(agent) {
    		        this.agent = agent;
    		        // Find the root window, because overlays are positioned relative to it.
    		        // @ts-ignore
    		        var currentWindow = window.__REACT_DEVTOOLS_TARGET_WINDOW__ || window;
    		        this.window = currentWindow;
    		        // When opened in shells/dev, the tooltip should be bound by the app iframe, not by the topmost window.
    		        // @ts-ignore
    		        var tipBoundsWindow = window.__REACT_DEVTOOLS_TARGET_WINDOW__ || window;
    		        this.tipBoundsWindow = tipBoundsWindow;
    		        var doc = currentWindow.document;
    		        this.container = doc.createElement("div");
    		        this.container.style.zIndex = "10000000";
    		        this.tip = new OverlayTip(doc, this.container);
    		        this.rects = [];
    		        this.agent = agent;
    		        doc.body.appendChild(this.container);
    		    }
    		    Overlay.prototype.remove = function () {
    		        this.tip.remove();
    		        this.rects.forEach(function (rect) {
    		            rect.remove();
    		        });
    		        this.rects.length = 0;
    		        if (this.container.parentNode) {
    		            this.container.parentNode.removeChild(this.container);
    		        }
    		    };
    		    Overlay.prototype.inspect = function (fiber, nodes) {
    		        var _this = this;
    		        // We can't get the size of text nodes or comment nodes. React as of v15
    		        // heavily uses comment nodes to delimit text.
    		        // TODO: We actually can measure text nodes. We should.
    		        var elements = nodes.filter(function (node) { return node.nodeType === Node.ELEMENT_NODE; });
    		        while (this.rects.length > elements.length) {
    		            var rect = this.rects.pop();
    		            rect.remove();
    		        }
    		        if (elements.length === 0) {
    		            return;
    		        }
    		        while (this.rects.length < elements.length) {
    		            this.rects.push(new OverlayRect(this.window.document, this.container));
    		        }
    		        var outerBox = {
    		            top: Number.POSITIVE_INFINITY,
    		            right: Number.NEGATIVE_INFINITY,
    		            bottom: Number.NEGATIVE_INFINITY,
    		            left: Number.POSITIVE_INFINITY,
    		        };
    		        elements.forEach(function (element, index) {
    		            var box = getNestedBoundingClientRect(element, _this.window);
    		            var dims = getElementDimensions(element);
    		            outerBox.top = Math.min(outerBox.top, box.top - dims.marginTop);
    		            outerBox.right = Math.max(outerBox.right, box.left + box.width + dims.marginRight);
    		            outerBox.bottom = Math.max(outerBox.bottom, box.top + box.height + dims.marginBottom);
    		            outerBox.left = Math.min(outerBox.left, box.left - dims.marginLeft);
    		            var rect = _this.rects[index];
    		            rect.update(box, dims);
    		        });
    		        var name = getFiberName(fiber);
    		        var typedEle = fiber._debugElement;
    		        var owner = typedEle === null || typedEle === void 0 ? void 0 : typedEle._owner;
    		        var ownerName = owner ? getFiberName(owner) : null;
    		        if (ownerName) {
    		            name += " (in " + ownerName + ")";
    		        }
    		        this.tip.updateText(name, outerBox.right - outerBox.left, outerBox.bottom - outerBox.top);
    		        var tipBounds = getNestedBoundingClientRect(this.tipBoundsWindow.document.documentElement, this.window);
    		        this.tip.updatePosition({
    		            top: outerBox.top,
    		            left: outerBox.left,
    		            height: outerBox.bottom - outerBox.top,
    		            width: outerBox.right - outerBox.left,
    		        }, {
    		            top: tipBounds.top + this.tipBoundsWindow.scrollY,
    		            left: tipBounds.left + this.tipBoundsWindow.scrollX,
    		            height: this.tipBoundsWindow.innerHeight,
    		            width: this.tipBoundsWindow.innerWidth,
    		        });
    		    };
    		    return Overlay;
    		}());
    		function findTipPos(dims, bounds, tipSize) {
    		    var tipHeight = Math.max(tipSize.height, 20);
    		    var tipWidth = Math.max(tipSize.width, 60);
    		    var margin = 5;
    		    var top;
    		    if (dims.top + dims.height + tipHeight <= bounds.top + bounds.height) {
    		        if (dims.top + dims.height < bounds.top + 0) {
    		            top = bounds.top + margin;
    		        }
    		        else {
    		            top = dims.top + dims.height + margin;
    		        }
    		    }
    		    else if (dims.top - tipHeight <= bounds.top + bounds.height) {
    		        if (dims.top - tipHeight - margin < bounds.top + margin) {
    		            top = bounds.top + margin;
    		        }
    		        else {
    		            top = dims.top - tipHeight - margin;
    		        }
    		    }
    		    else {
    		        top = bounds.top + bounds.height - tipHeight - margin;
    		    }
    		    var left = dims.left + margin;
    		    if (dims.left < bounds.left) {
    		        left = bounds.left + margin;
    		    }
    		    if (dims.left + tipWidth > bounds.left + bounds.width) {
    		        left = bounds.left + bounds.width - tipWidth - margin;
    		    }
    		    // @ts-ignore
    		    top += "px";
    		    // @ts-ignore
    		    left += "px";
    		    return {
    		        style: { top: top, left: left },
    		    };
    		}
    		function boxWrap(dims, what, node) {
    		    assign(node.style, {
    		        borderTopWidth: dims[what + "Top"] + "px",
    		        borderLeftWidth: dims[what + "Left"] + "px",
    		        borderRightWidth: dims[what + "Right"] + "px",
    		        borderBottomWidth: dims[what + "Bottom"] + "px",
    		        borderStyle: "solid",
    		    });
    		}
    		var overlayStyles = {
    		    background: "rgba(120, 170, 210, 0.7)",
    		    padding: "rgba(77, 200, 0, 0.3)",
    		    margin: "rgba(255, 155, 0, 0.3)",
    		    border: "rgba(255, 200, 50, 0.3)",
    		};

    		var Select = /** @class */ (function () {
    		    function Select(agent) {
    		        this.agent = agent;
    		        this.agent = agent;
    		    }
    		    Select.prototype.inspect = function (fiber) {
    		        var _a, _b;
    		        if (typeof window === "undefined")
    		            return;
    		        (_b = (_a = this.overlay) === null || _a === void 0 ? void 0 : _a.remove) === null || _b === void 0 ? void 0 : _b.call(_a);
    		        this.overlay = new Overlay(this.agent);
    		        this.overlay.inspect(fiber, getElementNodesFromFiber(fiber));
    		    };
    		    Select.prototype.remove = function () {
    		        var _a, _b;
    		        if (typeof window === "undefined")
    		            return;
    		        (_b = (_a = this.overlay) === null || _a === void 0 ? void 0 : _a.remove) === null || _b === void 0 ? void 0 : _b.call(_a);
    		    };
    		    return Select;
    		}());

    		// Note these colors are in sync with DevTools Profiler chart colors.
    		var COLORS = ["#37afa9", "#63b19e", "#80b393", "#97b488", "#abb67d", "#beb771", "#cfb965", "#dfba57", "#efbb49", "#febc38"];
    		var canvas = null;
    		function drawWeb(nodeToData) {
    		    if (canvas === null) {
    		        initialize();
    		    }
    		    var dpr = window.devicePixelRatio || 1;
    		    var canvasFlow = canvas;
    		    canvasFlow.width = window.innerWidth * dpr;
    		    canvasFlow.height = window.innerHeight * dpr;
    		    canvasFlow.style.width = "".concat(window.innerWidth, "px");
    		    canvasFlow.style.height = "".concat(window.innerHeight, "px");
    		    var context = canvasFlow.getContext("2d");
    		    context.scale(dpr, dpr);
    		    context.clearRect(0, 0, canvasFlow.width / dpr, canvasFlow.height / dpr);
    		    var mergedNodes = groupAndSortNodes(nodeToData);
    		    mergedNodes.forEach(function (group) {
    		        drawGroupBorders(context, group);
    		        drawGroupLabel(context, group);
    		    });
    		    if (canvas !== null) {
    		        if (nodeToData.size === 0 && canvas.matches(":popover-open")) {
    		            canvas.hidePopover();
    		            return;
    		        }
    		        if (canvas.matches(":popover-open")) {
    		            canvas.hidePopover();
    		        }
    		        canvas.showPopover();
    		    }
    		}
    		function groupAndSortNodes(nodeToData) {
    		    var positionGroups = new Map();
    		    iterateNodes(nodeToData, function (_a) {
    		        var _b;
    		        var rect = _a.rect, color = _a.color, displayName = _a.displayName, count = _a.count;
    		        if (!rect)
    		            return;
    		        var key = "".concat(rect.left, ",").concat(rect.top);
    		        if (!positionGroups.has(key))
    		            positionGroups.set(key, []);
    		        (_b = positionGroups.get(key)) === null || _b === void 0 ? void 0 : _b.push({ rect: rect, color: color, displayName: displayName, count: count });
    		    });
    		    return Array.from(positionGroups.values())
    		        .reverse()
    		        .sort(function (groupA, groupB) {
    		        var maxCountA = Math.max.apply(Math, groupA.map(function (item) { return item.count; }));
    		        var maxCountB = Math.max.apply(Math, groupB.map(function (item) { return item.count; }));
    		        return maxCountA - maxCountB;
    		    });
    		}
    		function drawGroupBorders(context, group) {
    		    group.forEach(function (_a) {
    		        var color = _a.color, rect = _a.rect;
    		        context.beginPath();
    		        context.strokeStyle = color;
    		        context.rect(rect.left - 1, rect.top, rect.width - 1, rect.height - 1);
    		        context.stroke();
    		    });
    		}
    		function drawGroupLabel(context, group) {
    		    var mergedName = group
    		        .map(function (_a) {
    		        var displayName = _a.displayName, count = _a.count;
    		        return (displayName ? "".concat(displayName).concat(count > 1 ? " x".concat(count) : "") : "");
    		    })
    		        .filter(Boolean)
    		        .join(", ");
    		    if (mergedName) {
    		        drawLabel(context, group[0].rect, mergedName, group[0].color);
    		    }
    		}
    		function draw(nodeToData) {
    		    drawWeb(nodeToData);
    		}
    		function iterateNodes(nodeToData, execute) {
    		    nodeToData.forEach(function (data, node) {
    		        var colorIndex = Math.min(COLORS.length - 1, data.count - 1);
    		        var color = COLORS[colorIndex];
    		        execute({
    		            color: color,
    		            node: node,
    		            count: data.count,
    		            displayName: data.displayName,
    		            expirationTime: data.expirationTime,
    		            lastMeasuredAt: data.lastMeasuredAt,
    		            rect: data.rect,
    		        });
    		    });
    		}
    		function drawLabel(context, rect, text, color) {
    		    var left = rect.left, top = rect.top;
    		    context.font = "10px monospace";
    		    context.textBaseline = "middle";
    		    context.textAlign = "center";
    		    var padding = 2;
    		    var textHeight = 14;
    		    var metrics = context.measureText(text);
    		    var backgroundWidth = metrics.width + padding * 2;
    		    var backgroundHeight = textHeight;
    		    var labelX = left - 1;
    		    var labelY = top - backgroundHeight;
    		    context.fillStyle = color;
    		    context.fillRect(labelX, labelY, backgroundWidth, backgroundHeight);
    		    context.fillStyle = "#000000";
    		    context.fillText(text, labelX + backgroundWidth / 2, labelY + backgroundHeight / 2);
    		}
    		function destroyWeb() {
    		    if (canvas !== null) {
    		        if (canvas.matches(":popover-open")) {
    		            canvas.hidePopover();
    		        }
    		        if (canvas.parentNode != null) {
    		            canvas.parentNode.removeChild(canvas);
    		        }
    		        canvas = null;
    		    }
    		}
    		function destroy() {
    		    return destroyWeb();
    		}
    		function initialize() {
    		    canvas = window.document.createElement("canvas");
    		    canvas.setAttribute("popover", "manual");
    		    canvas.style.cssText = "\n    xx-background-color: red;\n    xx-opacity: 0.5;\n    bottom: 0;\n    left: 0;\n    pointer-events: none;\n    position: fixed;\n    right: 0;\n    top: 0;\n    background-color: transparent;\n    outline: none;\n    box-shadow: none;\n    border: none;\n  ";
    		    canvas.setAttribute("data-update", "@my-react");
    		    var root = window.document.documentElement;
    		    root.insertBefore(canvas, root.firstChild);
    		}

    		// How long the rect should be shown for?
    		var DISPLAY_DURATION = 250;
    		// What's the longest we are willing to show the overlay for?
    		// This can be important if we're getting a flurry of events (e.g. scroll update).
    		var MAX_DISPLAY_DURATION = 3000;
    		// How long should a rect be considered valid for?
    		var REMEASUREMENT_AFTER_DURATION = 250;
    		// Some environments (e.g. React Native / Hermes) don't support the performance API yet.
    		var getCurrentTime = 
    		// $FlowFixMe[method-unbinding]
    		typeof performance === "object" && typeof performance.now === "function" ? function () { return performance.now(); } : function () { return Date.now(); };
    		var nodeToData = new Map();
    		var drawAnimationFrameID = null;
    		var redrawTimeoutID = null;
    		function traceUpdates(fibers) {
    		    fibers.forEach(function (fiber) {
    		        var node = fiber.nativeNode;
    		        if (!node)
    		            return;
    		        var data = nodeToData.get(node);
    		        var now = getCurrentTime();
    		        var lastMeasuredAt = data != null ? data.lastMeasuredAt : 0;
    		        var rect = data != null ? data.rect : null;
    		        if (rect === null || lastMeasuredAt + REMEASUREMENT_AFTER_DURATION < now) {
    		            lastMeasuredAt = now;
    		            rect = measureNode(node);
    		        }
    		        var comFiber = getComponentFiberByFiber(fiber);
    		        var displayName = getFiberName((comFiber || fiber));
    		        var plainNode = getPlainNodeByFiber(comFiber || fiber);
    		        if (plainNode && plainNode.m) {
    		            displayName += "✨";
    		        }
    		        nodeToData.set(node, {
    		            count: data != null ? data.count + 1 : 1,
    		            expirationTime: data != null ? Math.min(now + MAX_DISPLAY_DURATION, data.expirationTime + DISPLAY_DURATION) : now + DISPLAY_DURATION,
    		            lastMeasuredAt: lastMeasuredAt,
    		            rect: rect,
    		            displayName: displayName,
    		        });
    		    });
    		    if (redrawTimeoutID !== null) {
    		        clearTimeout(redrawTimeoutID);
    		        redrawTimeoutID = null;
    		    }
    		    if (drawAnimationFrameID === null) {
    		        drawAnimationFrameID = requestAnimationFrame(prepareToDraw);
    		    }
    		}
    		function prepareToDraw() {
    		    drawAnimationFrameID = null;
    		    redrawTimeoutID = null;
    		    var now = getCurrentTime();
    		    var earliestExpiration = Number.MAX_VALUE;
    		    // Remove any items that have already expired.
    		    nodeToData.forEach(function (data, node) {
    		        if (data.expirationTime < now) {
    		            nodeToData.delete(node);
    		        }
    		        else {
    		            earliestExpiration = Math.min(earliestExpiration, data.expirationTime);
    		        }
    		    });
    		    draw(nodeToData);
    		    if (earliestExpiration !== Number.MAX_VALUE) {
    		        redrawTimeoutID = setTimeout(prepareToDraw, earliestExpiration - now);
    		    }
    		}
    		function measureNode(node) {
    		    if (!node || typeof node.getBoundingClientRect !== "function") {
    		        return null;
    		    }
    		    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    		    // @ts-ignore
    		    var currentWindow = window.__REACT_DEVTOOLS_TARGET_WINDOW__ || window;
    		    return getNestedBoundingClientRect(node, currentWindow);
    		}
    		var Highlight = /** @class */ (function () {
    		    function Highlight(agent) {
    		        this.agent = agent;
    		        this.pendingUpdates = new Set();
    		        this.agent = agent;
    		    }
    		    Object.defineProperty(Highlight.prototype, "canvas", {
    		        get: function () {
    		            return canvas;
    		        },
    		        enumerable: false,
    		        configurable: true
    		    });
    		    Highlight.prototype.addPending = function (fiber, type) {
    		        if (typeof window === "undefined")
    		            return;
    		        if (type === "update") {
    		            this.pendingUpdates.add(fiber);
    		        }
    		    };
    		    Highlight.prototype.flushPending = function () {
    		        if (typeof window === "undefined")
    		            return;
    		        traceUpdates(this.pendingUpdates);
    		        this.pendingUpdates.clear();
    		    };
    		    Highlight.prototype.cancelPending = function () {
    		        if (typeof window === "undefined")
    		            return;
    		        nodeToData.clear();
    		        if (drawAnimationFrameID !== null) {
    		            cancelAnimationFrame(drawAnimationFrameID);
    		            drawAnimationFrameID = null;
    		        }
    		        if (redrawTimeoutID !== null) {
    		            clearTimeout(redrawTimeoutID);
    		            redrawTimeoutID = null;
    		        }
    		        destroy();
    		    };
    		    return Highlight;
    		}());

    		var DevToolCore = /** @class */ (function () {
    		    function DevToolCore() {
    		        var _this = this;
    		        this._dispatch = new Set();
    		        // 是否存在 @my-react
    		        this._detector = false;
    		        this._origin = "";
    		        this._map = new Map();
    		        this._timeMap = new Map();
    		        this._stack = [];
    		        // 字符串字典
    		        this._dir = {};
    		        this._hmr = {};
    		        this._error = {};
    		        this._warn = {};
    		        this._hoverId = "";
    		        this._selectId = "";
    		        this._selectDom = null;
    		        this._hasSelectChange = false;
    		        this._tempDomHoverId = "";
    		        this._domHoverId = "";
    		        this._trigger = {};
    		        this._state = {};
    		        this._source = null;
    		        this._needUnmount = false;
    		        this._enabled = false;
    		        // 在开发工具中选中组件定位到浏览器中
    		        this._enableHover = false;
    		        this._enableUpdate = false;
    		        this._enableRecord = false;
    		        this._supportRecord = false;
    		        // 在浏览器中选中dom定位到开发工具组件树中
    		        this._enableHoverOnBrowser = false;
    		        // 显示Retrigger的触发状态
    		        this._enableRetrigger = false;
    		        this._listeners = new Set();
    		        this.version = "0.0.1";
    		        this.id = Math.random().toString(16).slice(2);
    		        this.notifyAll = debounce(function () {
    		            _this.notifyDetector();
    		            if (_this._needUnmount) {
    		                _this._notify({ type: exports.DevToolMessageEnum.unmount, data: null });
    		                _this._needUnmount = false;
    		            }
    		            if (_this._dispatch.size) {
    		                _this._dispatch.forEach(function (dispatch) {
    		                    _this.notifyDispatch(dispatch);
    		                });
    		            }
    		            _this.notifyConfig();
    		            _this.notifyDir();
    		            _this.notifySelect();
    		            _this.notifyTrigger();
    		            _this.notifyTriggerStatus();
    		            _this.notifyHMR();
    		            _this.notifyHMRStatus();
    		            _this.notifyHMRExtend();
    		            _this.notifyWarn();
    		            _this.notifyWarnStatus();
    		            _this.notifyError();
    		            _this.notifyErrorStatus();
    		        }, 200);
    		        this.update = new Highlight(this);
    		        this.select = new Select(this);
    		    }
    		    DevToolCore.prototype.getDispatch = function () {
    		        return Array.from(this._dispatch);
    		    };
    		    Object.defineProperty(DevToolCore.prototype, "hasEnable", {
    		        get: function () {
    		            return this._enabled;
    		        },
    		        enumerable: false,
    		        configurable: true
    		    });
    		    DevToolCore.prototype.setHoverStatus = function (d) {
    		        setHoverStatus(this, d);
    		    };
    		    DevToolCore.prototype.enableBrowserHover = function () {
    		        enableBrowserHover(this);
    		    };
    		    DevToolCore.prototype.disableBrowserHover = function () {
    		        disableBrowserHover(this);
    		    };
    		    DevToolCore.prototype.setUpdateStatus = function (d) {
    		        setUpdateStatus(this, d);
    		    };
    		    DevToolCore.prototype.setRetriggerStatus = function (d) {
    		        setRetriggerStatus(this, d);
    		    };
    		    DevToolCore.prototype.addDispatch = function (dispatch) {
    		        if (dispatch)
    		            this._detector = true;
    		        if (this.hasDispatch(dispatch))
    		            return;
    		        setupDispatch(dispatch, this);
    		        this._dispatch.add(dispatch);
    		        this.patchDispatch(dispatch);
    		    };
    		    DevToolCore.prototype.patchDispatch = function (dispatch) {
    		        patchEvent(dispatch, this);
    		        patchRecord(dispatch, this);
    		    };
    		    DevToolCore.prototype.hasDispatch = function (dispatch) {
    		        return this._dispatch.has(dispatch);
    		    };
    		    DevToolCore.prototype.delDispatch = function (dispatch) {
    		        this._map.delete(dispatch);
    		        this._dispatch.delete(dispatch);
    		        this.notifyAll();
    		    };
    		    DevToolCore.prototype.subscribe = function (listener) {
    		        var _this = this;
    		        this._listeners.add(listener);
    		        return function () { return _this._listeners.delete(listener); };
    		    };
    		    DevToolCore.prototype.unSubscribe = function (listener) {
    		        this._listeners.delete(listener);
    		    };
    		    DevToolCore.prototype._notify = function (data) {
    		        var _this = this;
    		        this._listeners.forEach(function (listener) { return listener(__assign(__assign({}, data), { agentId: _this.id })); });
    		    };
    		    DevToolCore.prototype.setSelect = function (id) {
    		        var fiber = getFiberNodeById(id);
    		        if (!fiber)
    		            return;
    		        if (id === this._selectId)
    		            return;
    		        var domArray = getElementNodesFromFiber(fiber);
    		        this._selectId = id;
    		        this._selectDom = domArray[0];
    		    };
    		    DevToolCore.prototype.setSelectDom = function (dom) {
    		        var fiber = getComponentFiberByDom(dom);
    		        if (!fiber)
    		            return;
    		        var id = getPlainNodeIdByFiber(fiber);
    		        if (id === this._selectId)
    		            return;
    		        this._selectId = id;
    		        this._selectDom = dom;
    		        this._hasSelectChange = true;
    		    };
    		    DevToolCore.prototype.setHover = function (id) {
    		        this._hoverId = id;
    		    };
    		    DevToolCore.prototype.setSource = function (source) {
    		        this._source = source;
    		    };
    		    DevToolCore.prototype.showHover = function () {
    		        if (!this._enableHover)
    		            return;
    		        this.select.remove();
    		        if (this._hoverId) {
    		            var fiber = getFiberNodeById(this._hoverId);
    		            if (fiber) {
    		                this.select.inspect(fiber);
    		            }
    		        }
    		        else {
    		            this.select.remove();
    		        }
    		    };
    		    DevToolCore.prototype.inspectDom = function (agentId) {
    		        if (agentId && agentId !== this.id) {
    		            this.notifyMessage("cannot inspect dom from other agent", "error");
    		            return;
    		        }
    		        inspectDom(this);
    		    };
    		    DevToolCore.prototype.inspectCom = function (agentId) {
    		        if (agentId && agentId !== this.id) {
    		            this.notifyMessage("cannot inspect com from other agent", "error");
    		            return;
    		        }
    		        inspectCom(this);
    		    };
    		    DevToolCore.prototype.inspectSource = function (agentId) {
    		        if (agentId && agentId !== this.id) {
    		            this.notifyMessage("cannot inspect source from other agent", "error");
    		            return;
    		        }
    		        inspectSource(this);
    		    };
    		    DevToolCore.prototype.notifyDir = function () {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.dir, data: this._dir });
    		    };
    		    DevToolCore.prototype.notifyDetector = function () {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.init, data: this._detector });
    		    };
    		    DevToolCore.prototype.notifyTrigger = function () {
    		        if (!this.hasEnable)
    		            return;
    		        var state = getValidTrigger(this);
    		        this._notify({ type: exports.DevToolMessageEnum.trigger, data: state });
    		    };
    		    DevToolCore.prototype.notifyTriggerStatus = function () {
    		        if (!this.hasEnable)
    		            return;
    		        var id = this._selectId;
    		        if (!id)
    		            return;
    		        var state = getValidTriggerStatus(id, this);
    		        if (!state)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.triggerStatus, data: state });
    		    };
    		    DevToolCore.prototype.notifyHighlight = function (id, type) {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.highlight, data: { id: id, type: type } });
    		    };
    		    DevToolCore.prototype.notifyWarn = function () {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({
    		            type: exports.DevToolMessageEnum.warn,
    		            data: getMapValueLengthObject(this._warn),
    		        });
    		    };
    		    DevToolCore.prototype.notifyWarnStatus = function () {
    		        if (!this.hasEnable)
    		            return;
    		        var id = this._selectId;
    		        if (!id)
    		            return;
    		        var status = this._warn[id];
    		        if (!status)
    		            return;
    		        var finalStatus = status.slice(-10);
    		        this._notify({ type: exports.DevToolMessageEnum.warnStatus, data: finalStatus.map(function (i) { return getNode(i); }) });
    		    };
    		    DevToolCore.prototype.notifyError = function () {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({
    		            type: exports.DevToolMessageEnum.error,
    		            data: getMapValueLengthObject(this._error),
    		        });
    		    };
    		    DevToolCore.prototype.notifyErrorStatus = function () {
    		        if (!this.hasEnable)
    		            return;
    		        var id = this._selectId;
    		        if (!id)
    		            return;
    		        var status = this._error[id];
    		        if (!status)
    		            return;
    		        var finalStatus = status.slice(-10);
    		        this._notify({ type: exports.DevToolMessageEnum.errorStatus, data: finalStatus.map(function (i) { return getNode(i); }) });
    		    };
    		    // TODO
    		    DevToolCore.prototype.notifyChanged = function (list) {
    		        if (!this.hasEnable)
    		            return;
    		        var tree = getRootTreeByFiber(list.head.value);
    		        this._notify({ type: exports.DevToolMessageEnum.ready, data: tree });
    		    };
    		    DevToolCore.prototype.notifyHMR = function () {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.hmr, data: getMapValueLengthObject(this._hmr) });
    		    };
    		    DevToolCore.prototype.notifyHMRStatus = function () {
    		        if (!this.hasEnable)
    		            return;
    		        var id = this._selectId;
    		        if (!id)
    		            return;
    		        var status = this._hmr[id];
    		        if (!status)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.hmrStatus, data: status });
    		    };
    		    DevToolCore.prototype.notifyHMRExtend = function () {
    		        if (!this.hasEnable)
    		            return;
    		        var id = this._selectId;
    		        if (!id)
    		            return;
    		        var extend = getHMRInternalFromId(id);
    		        this._notify({ type: exports.DevToolMessageEnum.hmrInternal, data: extend ? getNode(extend) : null });
    		    };
    		    DevToolCore.prototype.notifyConfig = function () {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({
    		            type: exports.DevToolMessageEnum.config,
    		            data: {
    		                enableHover: this._enableHover,
    		                enableUpdate: this._enableUpdate,
    		                enableRetrigger: this._enableRetrigger,
    		                enableRecord: this._enableRecord,
    		                supportRecord: this._supportRecord,
    		                enableHoverOnBrowser: this._enableHoverOnBrowser,
    		            },
    		        });
    		    };
    		    DevToolCore.prototype.notifySelect = function () {
    		        if (!this.hasEnable)
    		            return;
    		        var id = this._selectId;
    		        if (!id)
    		            return;
    		        var fiber = getFiberNodeById(id);
    		        if (fiber) {
    		            this._notify({ type: exports.DevToolMessageEnum.detail, data: inspectFiber(fiber) });
    		        }
    		        else {
    		            this._notify({ type: exports.DevToolMessageEnum.detail, data: null });
    		        }
    		    };
    		    DevToolCore.prototype.notifySelectSync = function () {
    		        if (!this.hasEnable)
    		            return;
    		        if (this._hasSelectChange) {
    		            this._hasSelectChange = false;
    		            this._notify({ type: exports.DevToolMessageEnum.selectSync, data: this._selectId });
    		        }
    		    };
    		    DevToolCore.prototype.notifyUnmountNode = function (id) {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.unmountNode, data: id });
    		    };
    		    DevToolCore.prototype.notifyDomHover = function () {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.domHover, data: this._domHoverId });
    		    };
    		    DevToolCore.prototype.notifySource = function () {
    		        if (!this.hasEnable)
    		            return;
    		        // notify devtool to inspect source
    		        this._notify({ type: exports.DevToolMessageEnum.source, data: true });
    		    };
    		    DevToolCore.prototype.notifyChunks = function (ids) {
    		        if (!this.hasEnable)
    		            return;
    		        var data = getChunkDataFromIds(ids);
    		        this._notify({ type: exports.DevToolMessageEnum.chunks, data: data });
    		    };
    		    DevToolCore.prototype.notifyEditor = function (params) {
    		        if (!this.hasEnable)
    		            return;
    		        var fiber = getFiberNodeById(this._selectId);
    		        var res = updateFiberNode(fiber, params);
    		        if (typeof res === "string") {
    		            // have error
    		            this.notifyMessage(res, "error");
    		        }
    		        else {
    		            this.notifyMessage("update success", "success");
    		        }
    		    };
    		    DevToolCore.prototype.notifyMessage = function (message, type) {
    		        if (!this.hasEnable)
    		            return;
    		        this._notify({ type: exports.DevToolMessageEnum.message, data: { message: message, type: type } });
    		    };
    		    DevToolCore.prototype.notifyDispatch = function (dispatch, force) {
    		        if (!this.hasEnable)
    		            return;
    		        if (this._dispatch.has(dispatch)) {
    		            var now = Date.now();
    		            if (force) {
    		                this._timeMap.set(dispatch, now);
    		                var _a = getTree(dispatch, this), current = _a.current, directory = _a.directory;
    		                if (directory)
    		                    this.notifyDir();
    		                this._notify({ type: exports.DevToolMessageEnum.ready, data: current });
    		            }
    		            else {
    		                var last = this._timeMap.get(dispatch);
    		                if (last && now - last < 200)
    		                    return;
    		                this._timeMap.set(dispatch, now);
    		                var _b = getTree(dispatch, this), current = _b.current, directory = _b.directory;
    		                if (directory)
    		                    this.notifyDir();
    		                this._notify({ type: exports.DevToolMessageEnum.ready, data: current });
    		            }
    		        }
    		    };
    		    DevToolCore.prototype.notifyRecordStack = function () {
    		        var _this = this;
    		        if (!this.hasEnable)
    		            return;
    		        var data = getRecord(this);
    		        data.map(function (item) { return _this._notify({ type: exports.DevToolMessageEnum.record, data: item }); });
    		        this._notify({ type: exports.DevToolMessageEnum.record, data: true });
    		    };
    		    // TODO support multiple connect agent
    		    DevToolCore.prototype.connect = function () {
    		        if (this._enabled)
    		            return;
    		        this._enabled = true;
    		    };
    		    DevToolCore.prototype.disconnect = function () {
    		        if (!this._enabled)
    		            return;
    		        this.select.remove();
    		        this.update.cancelPending();
    		        this._enabled = false;
    		    };
    		    DevToolCore.prototype.startRecord = function () { };
    		    DevToolCore.prototype.stopRecord = function () { };
    		    DevToolCore.prototype.clear = function () {
    		        this._error = {};
    		        this._hmr = {};
    		        this._hoverId = "";
    		        this._selectId = "";
    		        this._selectDom = null;
    		        this._source = null;
    		        this._domHoverId = "";
    		        this._tempDomHoverId = "";
    		        this._state = {};
    		        this._trigger = {};
    		        this._warn = {};
    		        this._enableHoverOnBrowser = false;
    		        this.disableBrowserHover();
    		        this.stopRecord();
    		    };
    		    DevToolCore.prototype.clearHMR = function () {
    		        this._hmr = {};
    		        this.notifyHMR();
    		        this.notifyHMRStatus();
    		    };
    		    DevToolCore.prototype.clearMessage = function () {
    		        this._warn = {};
    		        this._error = {};
    		        this.notifyWarn();
    		        this.notifyError();
    		        this.notifyWarnStatus();
    		        this.notifyErrorStatus();
    		    };
    		    DevToolCore.prototype.clearTrigger = function () {
    		        this._trigger = {};
    		        this.notifyTrigger();
    		        this.notifyTriggerStatus();
    		    };
    		    return DevToolCore;
    		}());

    		exports.DevToolCore = DevToolCore;
    		exports.DevToolSource = DevToolSource;
    		exports.PlainNode = PlainNode;
    		exports.assignFiber = assignFiber;
    		exports.debounce = debounce;
    		exports.getComponentFiberByDom = getComponentFiberByDom;
    		exports.getComponentFiberByFiber = getComponentFiberByFiber;
    		exports.getContextName = getContextName;
    		exports.getDirectoryIdByFiber = getDirectoryIdByFiber;
    		exports.getDispatchFromFiber = getDispatchFromFiber;
    		exports.getElementName = getElementName;
    		exports.getElementNodesFromFiber = getElementNodesFromFiber;
    		exports.getFiberByDom = getFiberByDom;
    		exports.getFiberName = getFiberName;
    		exports.getFiberNodeById = getFiberNodeById;
    		exports.getFiberTag = getFiberTag;
    		exports.getFiberType = getFiberType;
    		exports.getHMRInternal = getHMRInternal;
    		exports.getHMRInternalFromId = getHMRInternalFromId;
    		exports.getHMRState = getHMRState;
    		exports.getMockFiberFromElement = getMockFiberFromElement;
    		exports.getNode = getNode;
    		exports.getNodeFromId = getNodeFromId;
    		exports.getPlainNodeByFiber = getPlainNodeByFiber;
    		exports.getPlainNodeIdByFiber = getPlainNodeIdByFiber;
    		exports.getProps = getProps;
    		exports.getRootTreeByFiber = getRootTreeByFiber;
    		exports.getSource = getSource;
    		exports.getState = getState;
    		exports.getTree = getTree$1;
    		exports.getTypeName = getTypeName;
    		exports.getValueFromId = getValueFromId;
    		exports.initPlainNode = initPlainNode;
    		exports.inspectDispatch = inspectDispatch;
    		exports.inspectFiber = inspectFiber;
    		exports.inspectList = inspectList;
    		exports.isProxy = isProxy;
    		exports.isReactive = isReactive;
    		exports.isReadonly = isReadonly;
    		exports.isRef = isRef;
    		exports.isShallow = isShallow;
    		exports.isValidElement = isValidElement;
    		exports.loopChangedTree = loopChangedTree;
    		exports.loopTree = loopTree;
    		exports.shallowAssignFiber = shallowAssignFiber;
    		exports.throttle = throttle;
    		exports.typeKeys = typeKeys;
    		exports.unmountPlainNode = unmountPlainNode;
    		exports.updateFiberNode = updateFiberNode; 
    	} (index_production));
    	return index_production;
    }

    var hasRequiredCore;

    function requireCore () {
    	if (hasRequiredCore) return core$1.exports;
    	hasRequiredCore = 1;

    	{
    	  core$1.exports = requireIndex_production();
    	}
    	return core$1.exports;
    }

    var coreExports = requireCore();

    var core = new coreExports.DevToolCore();

    /******************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise, SuppressedError, Symbol, Iterator */


    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };

    /* eslint-disable @typescript-eslint/no-require-imports */
    var varId = 0;
    var getValidGlobalVarName = function () {
        var varName = "$my-react-var-".concat(varId++);
        while (globalThis[varName]) {
            varName = "$my-react-var-".concat(varId++);
        }
        return varName;
    };
    var generatePostMessageWithSource = function (from) {
        return function (message) {
            if (typeof window === "undefined")
                return;
            var _message = __assign({}, message);
            if (_message.from && _message.forward) {
                _message.forward += "->".concat(from);
            }
            else if (_message.from) {
                if (_message.from !== from) {
                    _message.forward = from;
                }
            }
            else {
                _message.from = from;
            }
            window.postMessage(__assign(__assign({}, _message), { source: eventExports.DevToolSource }), "*");
        };
    };

    var onMessageFromPanelOrWorkerOrDetector = function (data) {
        if (data.source !== coreExports.DevToolSource)
            return;
        var typedData = data;
        if (typedData.agentId && typedData.agentId !== core.id)
            return;
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessageWorkerType.init || (data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.show) {
            core.connect();
            core.notifyAll();
        }
        // 主动关闭panel / 或者worker失活
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.hide || (data === null || data === void 0 ? void 0 : data.type) === coreExports.MessageWorkerType.close) {
            core.disconnect();
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.nodeSelect) {
            core.setSelect(data.data);
            core.notifySelect();
            core.notifyHMRStatus();
            core.notifyHMRExtend();
            core.notifyTriggerStatus();
            core.notifyWarnStatus();
            core.notifyErrorStatus();
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.nodeStore) {
            var id = data.data;
            var f = coreExports.getFiberNodeById(id);
            if (f) {
                console.log("[@my-react-devtool/hook] %cStore fiber node%c Value: %o", "color: white;background-color: rgba(10, 190, 235, 0.8); border-radius: 2px; padding: 2px 5px", "", f);
                core.notifyMessage("success log current id: ".concat(id, " of fiber in the console"), "success");
            }
            else {
                core.notifyMessage("current id: ".concat(id, " of fiber not exist"), "error");
            }
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.nodeTrigger) {
            var id = data.data;
            var f = coreExports.getFiberNodeById(id);
            if (f) {
                f._update(reactSharedExports.STATE_TYPE.__triggerConcurrentForce__);
                core.notifyMessage("success trigger a update for current id: ".concat(id, " of fiber"), "success");
            }
            else {
                core.notifyMessage("current id: ".concat(id, " of fiber not exist"), "error");
            }
        }
        // if (data?.type === MessagePanelType.nodeInspect) {
        //   core.inspectDom();
        // }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.nodeHover) {
            core.setHover(data.data);
            core.showHover();
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.nodeEditor) {
            core.notifyEditor(data.data);
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.enableHover) {
            core.setHoverStatus(data.data);
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.enableUpdate) {
            core.setUpdateStatus(data.data);
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.enableHoverOnBrowser) {
            var d = data.data;
            if (d) {
                core.enableBrowserHover();
            }
            else {
                core.disableBrowserHover();
            }
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.enableRetrigger) {
            var d = data.data;
            core.setRetriggerStatus(d);
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.enableRecord) {
            var d = data.data;
            if (d) {
                core.startRecord();
            }
            else {
                core.stopRecord();
            }
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.chunks) {
            core.notifyChunks(data.data);
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.varStore) {
            var id = data.data;
            var _a = coreExports.getValueFromId(id), f = _a.f, varStore = _a.v;
            if (f) {
                var varName = getValidGlobalVarName();
                globalThis[varName] = varStore;
                console.log("[@my-react-devtool/hook] %cStore global variable%c Name: ".concat(varName), "color: white;background-color: rgba(10, 190, 235, 0.8); border-radius: 2px; padding: 2px 5px", "");
                console.log("[@my-react-devtool/hook] %cStore global variable%c Value: %o", "color: white;background-color: rgba(10, 190, 235, 0.8); border-radius: 2px; padding: 2px 5px", "", varStore);
                core.notifyMessage("success store current id: ".concat(id, " of data in the global variable: ").concat(varName), "success");
            }
            else {
                core.notifyMessage("current id: ".concat(id, " of data not exist"), "error");
            }
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.varSource) {
            var id = data.data;
            var varSource = coreExports.getValueFromId(id).v;
            core.setSource(varSource);
            core.notifySource();
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.clear) {
            core.clear();
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.clearHMR) {
            core.clearHMR();
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.clearMessage) {
            core.clearMessage();
        }
        if ((data === null || data === void 0 ? void 0 : data.type) === coreExports.MessagePanelType.clearTrigger) {
            core.clearTrigger();
        }
    };

    var PortName;
    (function (PortName) {
        PortName["proxy"] = "dev-tool/proxy";
        PortName["panel"] = "dev-tool/panel";
    })(PortName || (PortName = {}));
    var sourceFrom;
    (function (sourceFrom) {
        // message from hook script
        sourceFrom["hook"] = "hook";
        // message from proxy script
        sourceFrom["proxy"] = "proxy";
        // message from devtool panel
        sourceFrom["panel"] = "panel";
        // message from background worker
        sourceFrom["worker"] = "worker";
        // message from iframe 
        sourceFrom["iframe"] = "iframe";
        // message from socket
        sourceFrom["socket"] = "socket";
        // message from detector
        sourceFrom["detector"] = "detector";
        // message from another runtime engine
        sourceFrom["forward"] = "forward";
    })(sourceFrom || (sourceFrom = {}));

    var hookPostMessageWithSource = generatePostMessageWithSource(sourceFrom.hook);
    var forwardPostMessageWithSource = generatePostMessageWithSource(sourceFrom.forward);
    // default render agentId
    var agentId = core.id;
    var hasEnable = false;
    core.subscribe(function (message) {
        hookPostMessageWithSource({ type: eventExports.MessageHookType.render, data: message, to: sourceFrom.panel });
    });
    var set = new Set();
    var detectorReady = false;
    var idMap = new Map();
    var runWhenDetectorReady = function (fn, count) {
        var id = idMap.get(fn);
        clearTimeout(id);
        if (detectorReady) {
            fn();
        }
        else {
            if (count && count > 18) {
                return;
            }
            var newId = setTimeout(function () { return runWhenDetectorReady(fn, count ? count + 1 : 1); }, 1000);
            idMap.set(fn, newId);
        }
    };
    var onMessage = function (message) {
        var _a, _b, _c;
        if (typeof window === "undefined")
            return;
        if (message.source !== window)
            return;
        if (((_a = message.data) === null || _a === void 0 ? void 0 : _a.source) !== eventExports.DevToolSource)
            return;
        if (((_b = message.data) === null || _b === void 0 ? void 0 : _b.to) !== sourceFrom.hook)
            return;
        if (!detectorReady && ((_c = message.data) === null || _c === void 0 ? void 0 : _c.type) === eventExports.MessageDetectorType.init) {
            detectorReady = true;
        }
        if (message.data.type === eventExports.MessagePanelType.show) {
            hookPostMessageWithSource({ type: eventExports.MessageHookType.clear, to: sourceFrom.panel, data: { agentId: agentId, force: true } });
        }
        onMessageFromPanelOrWorkerOrDetector(message.data);
    };
    if (typeof window !== "undefined") {
        window.addEventListener("message", onMessage);
    }
    var onceMount = reactSharedExports.once(function () {
        // current site is render by @my-react
        hookPostMessageWithSource({ type: eventExports.MessageHookType.mount, to: sourceFrom.detector });
    });
    var onceDev = reactSharedExports.once(function () {
        hookPostMessageWithSource({ type: eventExports.MessageHookType.mount, data: "develop", to: sourceFrom.detector });
    });
    var oncePro = reactSharedExports.once(function () {
        hookPostMessageWithSource({ type: eventExports.MessageHookType.mount, data: "product", to: sourceFrom.detector });
    });
    var onceOrigin = reactSharedExports.once(function () {
        try {
            var origin_1 = window.location.origin;
            core._origin = origin_1;
            if (origin_1) {
                hookPostMessageWithSource({ type: eventExports.MessageHookType.origin, data: origin_1, to: sourceFrom.detector });
            }
        }
        catch (_a) {
        }
    });
    var globalHook = function (dispatch) {
        if (!hasEnable)
            return;
        set.add(dispatch);
        core.addDispatch(dispatch);
        if (dispatch.mode === "development") {
            runWhenDetectorReady(onceDev);
        }
        else if (dispatch.mode === "production") {
            runWhenDetectorReady(oncePro);
        }
        else {
            runWhenDetectorReady(onceMount);
        }
        runWhenDetectorReady(onceOrigin);
    };
    if (!globalThis["__MY_REACT_DEVTOOL_INTERNAL__"]) {
        globalThis["__MY_REACT_DEVTOOL_INTERNAL__"] = core;
        globalThis["__MY_REACT_DEVTOOL_RUNTIME__"] = globalHook;
        globalThis["__@my-react/react-devtool-inject__"] = globalHook;
        hookPostMessageWithSource({ type: eventExports.MessageHookType.init, to: sourceFrom.detector });
        globalHook.init = function () { return hookPostMessageWithSource({ type: eventExports.MessageHookType.init, to: sourceFrom.detector }); };
    }
    var initFORWARD_DEV = function () {
        hasEnable = true;
        if (Array.isArray(globalThis["__@my-react/dispatch__"])) {
            globalThis["__@my-react/dispatch__"].forEach(function (dispatch) {
                globalHook(dispatch);
            });
        }
        forwardPostMessageWithSource({ to: sourceFrom.hook });
    };

    globalThis["__MY_REACT_DEVTOOL_FORWARD__"] = initFORWARD_DEV;

})();
