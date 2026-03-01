//go:build darwin && amd64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/../lib/darwin_amd64 -ltalon
#cgo LDFLAGS: -framework Security -framework CoreFoundation -liconv
*/
import "C"
